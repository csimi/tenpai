// Host-authoritative riichi mahjong state machine.
//
// One peer (the host) owns the single source of truth `GameState` and runs all
// of these functions. Clients only send action intents; the host validates and
// applies them, then broadcasts a per-player sanitized view (see viewFor).
//
// Rules implemented: dealing, draw/discard, riichi, pon/chi/kan (open, closed,
// added), tsumo/ron with full yaku & scoring, chankan, rinshan, kan-dora,
// furiten, multiple ron, exhaustive draw with tenpai payments, dealer rotation,
// honba and riichi sticks. Defaults to an East-only match (tonpuusen).

import {
  buildWall, doraFromIndicator, sortTiles, removeOne, rankOf, suitOf, baseKind, isRedFive
} from './tiles.js'
import { waitingTiles, isWinningHand } from './agari.js'
import { scoreHand } from './score.js'

const SEAT_WINDS = ['1z', '2z', '3z', '4z'] // East South West North
const STARTING_SCORE = 25000
const RIICHI_BET = 1000

const seatWindFor = (seat, dealer) => SEAT_WINDS[(seat - dealer + 4) % 4]
const nextSeat = (seat) => (seat + 1) % 4

// Remove one tile whose base kind matches `wanted` (so a red five satisfies a
// request for its ordinary five), returning [newTiles, removedTile|null]. Used
// when forming melds so the actual tile (red or not) ends up in the meld. When
// both a red and an ordinary five are available, take the red one: it counts as
// aka dora whether melded or concealed, so locking it into the meld preserves
// the dora that an exposed five could later be forced to discard away.
function takeByBase(tiles, wanted) {
  let idx = tiles.findIndex((tile) => baseKind(tile) === wanted && isRedFive(tile))
  if (idx === -1) idx = tiles.findIndex((tile) => baseKind(tile) === wanted)
  if (idx === -1) return [tiles, null]
  return [tiles.slice(0, idx).concat(tiles.slice(idx + 1)), tiles[idx]]
}

// ---- Game / round setup ----------------------------------------------------

export function createGame(players, options = {}) {
  return {
    phase: 'playing',
    players, // [{ id, name }] length 4, index === seat
    scores: players.map(() => STARTING_SCORE),
    dealer: 0,
    roundWind: '1z',
    roundNumber: 1,
    honba: 0,
    riichiSticks: 0,
    // Final wind of the match: East-only (tonpuusen) by default, '2z' for an
    // East+South hanchan, '4z' for a full four-wind match. An explicit
    // `maxRoundWind` wins; `hanchan: true` is kept as a shorthand for '2z'.
    maxRoundWind: options.maxRoundWind || (options.hanchan ? '2z' : '1z'),
    aka: !!options.aka, // red fives (akadora)
    result: null,
    log: [],
    seed: options.seed
  }
}

export function startRound(game) {
  const wall = buildWall(Math.random, game.aka)
  // Dead wall = last 14 tiles. Dora indicators are positions within it.
  const deadWall = wall.splice(wall.length - 14, 14)
  // Indicator at deadWall[4]; ura at deadWall[5]; kan replacements drawn from
  // the front of the dead wall (index 0,1,2,3); subsequent kan dora at 6,7,8...
  const doraIndicators = [deadWall[4]]
  const uraDoraIndicators = [deadWall[5]]

  const hands = [[], [], [], []]
  for (let round = 0; round < 13; round++) {
    for (let seat = 0; seat < 4; seat++) hands[seat].push(wall.shift())
  }
  for (let seat = 0; seat < 4; seat++) hands[seat] = sortTiles(hands[seat])

  const state = {
    ...game,
    // A round always begins in active play; the incoming game may still carry
    // the previous round's 'roundEnd' phase (nextRound doesn't reset it).
    phase: 'playing',
    wall,
    deadWall,
    rinshanDrawn: 0,
    doraIndicators,
    uraDoraIndicators,
    revealedDoraCount: 1,
    hands,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    riichi: [false, false, false, false],
    doubleRiichi: [false, false, false, false],
    ippatsu: [false, false, false, false],
    riichiDiscardIndex: [-1, -1, -1, -1],
    furiten: [false, false, false, false],
    tempFuriten: [false, false, false, false],
    turn: game.dealer,
    drawnTile: null,
    drawnFrom: null, // 'wall' | 'rinshan'
    state: 'draw',
    lastDiscard: null,
    pendingCalls: null,
    anyCallMade: false,
    firstGoAround: true,
    chankanTile: null,
    result: null
  }
  // Draw the dealer's opening tile so play begins in the 'discard' sub-state.
  return beginTurn(state)
}

// ---- Turn flow -------------------------------------------------------------

function liveWallCount(state) {
  return state.wall.length
}

export function beginTurn(state) {
  const seat = state.turn
  // Ippatsu only survives one uninterrupted go-around; reaching your own draw
  // again (or any call) ends it.
  state.ippatsu[seat] = false
  if (liveWallCount(state) === 0) {
    return exhaustiveDraw(state)
  }
  const tile = state.wall.shift()
  state.hands[seat] = sortTiles([...state.hands[seat], tile])
  state.drawnTile = tile
  state.drawnFrom = 'wall'
  state.state = 'discard'
  return state
}

function drawRinshan(state) {
  const seat = state.turn
  // Replacement tile comes from the front of the dead wall; a live-wall tile
  // backfills the dead wall so its size stays 14.
  const tile = state.deadWall[state.rinshanDrawn]
  state.rinshanDrawn++
  if (state.wall.length > 0) state.deadWall.push(state.wall.pop())
  state.hands[seat] = sortTiles([...state.hands[seat], tile])
  state.drawnTile = tile
  state.drawnFrom = 'rinshan'
  state.state = 'discard'
  return state
}

function revealKanDora(state) {
  // Indicator positions 4,6,7,8 of the dead wall (after the initial dora).
  const pos = 4 + state.revealedDoraCount * 2
  if (state.deadWall[pos] !== undefined) {
    state.doraIndicators.push(state.deadWall[pos])
    state.uraDoraIndicators.push(state.deadWall[pos + 1])
  }
  state.revealedDoraCount++
}

export function currentDoraTiles(state) {
  return state.doraIndicators.map(doraFromIndicator)
}
function uraDoraTiles(state) {
  return state.uraDoraIndicators.map(doraFromIndicator)
}

// ---- Action helpers --------------------------------------------------------

// What can `seat` do on their own turn right now (after drawing)?
export function selfOptions(state, seat) {
  if (state.state !== 'discard' || state.turn !== seat) return {}
  // Tsumo / riichi / kan all require a freshly drawn tile. After a pon or chi
  // the caller has no draw and may only discard.
  if (!state.drawnTile) return {}
  const hand = state.hands[seat]
  const melds = state.melds[seat]
  const options = {}

  // Tsumo
  const winCtx = buildWinContext(state, seat, state.drawnTile, true)
  if (isWinningHand(hand, melds, state.drawnTile)) {
    const scored = scoreHand(winCtx)
    if (scored.valid) options.tsumo = true
  }

  // Riichi: closed hand, 13+ tiles tenpai after some discard, >= 1000 points,
  // tiles left in wall.
  if (melds.every((meld) => meld.concealed) && !state.riichi[seat] &&
      state.scores[seat] >= RIICHI_BET && liveWallCount(state) >= 4) {
    const riichiDiscards = []
    const seen = new Set()
    for (const tile of hand) {
      if (seen.has(tile)) continue
      seen.add(tile)
      const rest = removeOne(hand, tile)
      if (waitingTiles(rest, melds).length > 0) riichiDiscards.push(tile)
    }
    if (riichiDiscards.length > 0) options.riichi = riichiDiscards
  }

  // Kan options (closed kan of 4, or added kan onto an existing pon). Counts are
  // by base kind so four fives that include the red one still form a kan.
  const kans = []
  const counts = {}
  for (const tile of hand) counts[baseKind(tile)] = (counts[baseKind(tile)] || 0) + 1
  for (const base of Object.keys(counts)) {
    if (counts[base] === 4) {
      // Cannot make an ankan that would change a riichi wait.
      if (state.riichi[seat] && !riichiKanAllowed(hand, melds, base)) continue
      kans.push({ kind: 'closed', tile: base })
    }
  }
  for (const meld of melds) {
    if (meld.type === 'pon' && hand.some((tile) => baseKind(tile) === baseKind(meld.tiles[0])) && !state.riichi[seat]) {
      kans.push({ kind: 'added', tile: meld.tiles[0] })
    }
  }
  if (kans.length > 0 && state.rinshanDrawn < 4 && liveWallCount(state) > 0) options.kan = kans

  return options
}

// An ankan while in riichi is only legal if it doesn't alter the wait. `tile` is
// a base kind; normalize the hand so a red five is treated as its ordinary five.
function riichiKanAllowed(hand, melds, tile) {
  const baseHand = hand.map(baseKind)
  const before = waitingTiles(removeOne(baseHand, tile), melds).slice().sort().join()
  const withKan = baseHand.filter((candidate) => candidate !== tile)
  const after = waitingTiles(withKan, [...melds, { type: 'kan', tiles: [tile, tile, tile, tile], concealed: true }]).slice().sort().join()
  return before === after
}

// What can each other seat do in response to `discard` by `discarder`?
function computeCalls(state, discarder, tile) {
  const calls = {}
  for (let seat = 0; seat < 4; seat++) {
    if (seat === discarder) continue
    const hand = state.hands[seat]
    const melds = state.melds[seat]
    const options = {}

    // Ron
    if (isWinningHand([...hand, tile], melds, tile) && !isFuriten(state, seat, tile)) {
      const scored = scoreHand(buildWinContext(state, seat, tile, false))
      if (scored.valid) options.ron = true
    }

    // Pon / open kan — any seat, needs 2 (pon) or 3 (kan) matching tiles (by base
    // kind, so a red five counts toward matching an ordinary five and vice versa).
    if (!state.riichi[seat]) {
      const matching = hand.filter((candidate) => baseKind(candidate) === baseKind(tile)).length
      if (matching >= 2) options.pon = true
      if (matching >= 3 && state.rinshanDrawn < 4) options.kan = true

      // Chi — only the player to the discarder's immediate left (next seat).
      if (seat === nextSeat(discarder) && suitOf(tile) !== 'z') {
        const chis = possibleChi(hand, tile)
        if (chis.length > 0) options.chi = chis
      }
    }

    if (Object.keys(options).length > 0) {
      calls[seat] = { options, responded: false, choice: null }
    }
  }
  return Object.keys(calls).length > 0 ? calls : null
}

function possibleChi(hand, tile) {
  if (suitOf(tile) === 'z') return []
  const suit = suitOf(tile)
  const rank = rankOf(tile) // 5 for a red five
  const at = (offset) => `${rank + offset}${suit}` // base kinds
  const has = (offset) => hand.some((candidate) => baseKind(candidate) === at(offset))
  // The discarded tile keeps its actual kind in its slot (so a red discard shows
  // red); the neighbour slots are base kinds the holder may satisfy with a red.
  const sequences = []
  if (rank >= 3 && has(-2) && has(-1)) sequences.push([at(-2), at(-1), tile])
  if (rank >= 2 && rank <= 8 && has(-1) && has(1)) sequences.push([at(-1), tile, at(1)])
  if (rank <= 7 && has(1) && has(2)) sequences.push([tile, at(1), at(2)])
  return sequences
}

// Furiten: cannot ron if any of your waits sits in your own discards, or while
// temporarily/permanently furiten from passing a winning tile.
function isFuriten(state, seat, ronTile) {
  if (state.tempFuriten[seat] || state.furiten[seat]) return true
  const waits = waitingTiles(state.hands[seat], state.melds[seat]) // base kinds
  for (const wait of waits) {
    if (state.discards[seat].some((discard) => baseKind(discard.tile) === wait)) return true
  }
  // Can't ron a tile you'd be passing this turn either (caller checks waits).
  return !waits.includes(baseKind(ronTile))
}

function buildWinContext(state, seat, winningTile, isTsumo) {
  const concealed = isTsumo ? state.hands[seat] : [...state.hands[seat], winningTile]
  return {
    concealed,
    melds: state.melds[seat],
    winningTile,
    isTsumo,
    seatWind: seatWindFor(seat, state.dealer),
    roundWind: state.roundWind,
    riichi: state.riichi[seat],
    doubleRiichi: state.doubleRiichi[seat],
    ippatsu: state.ippatsu[seat],
    isHaitei: isTsumo && liveWallCount(state) === 0 && state.drawnFrom === 'wall',
    isHoutei: !isTsumo && liveWallCount(state) === 0,
    isRinshan: isTsumo && state.drawnFrom === 'rinshan',
    isChankan: !isTsumo && state.chankanTile === winningTile,
    blessing: blessingFor(state, seat, isTsumo),
    doraTiles: currentDoraTiles(state),
    uraDoraTiles: uraDoraTiles(state),
    isDealer: seat === state.dealer
  }
}

function blessingFor(state, seat, isTsumo) {
  if (!state.firstGoAround || state.anyCallMade) return null
  if (isTsumo && seat === state.dealer && state.discards.every((pile) => pile.length === 0)) return 'tenhou'
  if (isTsumo && seat !== state.dealer && state.discards.every((pile) => pile.length === 0)) return 'chiihou'
  return null
}

// ---- Applying actions ------------------------------------------------------

// Returns the updated state. Illegal actions are ignored (returned unchanged).
export function applyAction(state, seat, action) {
  if (state.phase !== 'playing') return state
  switch (action.type) {
    case 'discard': return doDiscard(state, seat, action.tile, false)
    case 'riichi': return doDiscard(state, seat, action.tile, true)
    case 'tsumo': return doTsumo(state, seat)
    case 'kan': return doSelfKan(state, seat, action)
    case 'callResponse': return doCallResponse(state, seat, action.response)
    default: return state
  }
}

function doDiscard(state, seat, tile, declareRiichi) {
  if (state.state !== 'discard' || state.turn !== seat) return state
  if (!state.hands[seat].includes(tile)) return state
  // Once in riichi the hand is locked: only the freshly drawn tile may go (tsumogiri).
  if (!declareRiichi && state.riichi[seat] && tile !== state.drawnTile) return state
  if (declareRiichi) {
    const opts = selfOptions(state, seat)
    if (!opts.riichi || !opts.riichi.includes(tile)) return state
    state.riichi[seat] = true
    state.ippatsu[seat] = true
    if (state.firstGoAround && !state.anyCallMade) state.doubleRiichi[seat] = true
  }

  state.hands[seat] = removeOne(state.hands[seat], tile)
  const discardIndex = state.discards[seat].length
  state.discards[seat].push({ tile, tsumogiri: tile === state.drawnTile, riichi: declareRiichi })
  if (declareRiichi) state.riichiDiscardIndex[seat] = discardIndex
  state.drawnTile = null
  state.chankanTile = null
  state.lastDiscard = { seat, tile, index: discardIndex }

  // The discarder becomes furiten if this tile is one of their own waits.
  refreshFuriten(state, seat)

  const calls = computeCalls(state, seat, tile)
  if (calls) {
    state.pendingCalls = calls
    state.state = 'callWait'
    autoResolveCalls(state)
    return state
  }
  return advanceAfterDiscard(state, seat)
}

function refreshFuriten(state, seat) {
  const waits = waitingTiles(state.hands[seat], state.melds[seat]) // base kinds
  const inDiscards = waits.some((wait) => state.discards[seat].some((discard) => baseKind(discard.tile) === wait))
  // Riichi furiten is permanent for the round.
  if (state.riichi[seat]) state.furiten[seat] = state.furiten[seat] || inDiscards
  else state.furiten[seat] = inDiscards
}

function advanceAfterDiscard(state, seat) {
  if (state.turn !== state.dealer || state.discards.some((pile) => pile.length > 0)) {
    // first go-around ends once it passes the dealer's first discard
  }
  // First uninterrupted go-around ends after North discards once.
  if (seat === 3) state.firstGoAround = false
  state.turn = nextSeat(seat)
  return beginTurn(state)
}

function doTsumo(state, seat) {
  if (state.state !== 'discard' || state.turn !== seat || !state.drawnTile) return state
  if (!isWinningHand(state.hands[seat], state.melds[seat], state.drawnTile)) return state
  const scored = scoreHand(buildWinContext(state, seat, state.drawnTile, true))
  if (!scored.valid) return state
  return settleWin(state, [{ seat, from: null, scored, winningTile: state.drawnTile, isTsumo: true }])
}

function doSelfKan(state, seat, action) {
  if (state.state !== 'discard' || state.turn !== seat || !state.drawnTile) return state
  const { kind, tile } = action
  if (kind === 'closed') {
    // `tile` is a base kind; gather the four actual fives (red included).
    let hand = state.hands[seat]
    const tiles = []
    for (let removed = 0; removed < 4; removed++) {
      const [rest, taken] = takeByBase(hand, baseKind(tile))
      hand = rest
      if (taken) tiles.push(taken)
    }
    if (tiles.length < 4) return state
    if (state.riichi[seat] && !riichiKanAllowed(state.hands[seat], state.melds[seat], baseKind(tile))) return state
    state.hands[seat] = hand
    state.melds[seat].push({ type: 'kan', tiles, concealed: true, from: seat })
    state.drawnTile = null
    state.anyCallMade = true
    revealKanDora(state) // ankan reveals immediately
    return drawRinshan(state)
  }
  if (kind === 'added') {
    const meld = state.melds[seat].find((candidate) => candidate.type === 'pon' && baseKind(candidate.tiles[0]) === baseKind(tile))
    const handIdx = state.hands[seat].findIndex((candidate) => baseKind(candidate) === baseKind(tile))
    if (!meld || handIdx === -1) return state
    // Chankan window: other players may ron this tile (the actual added tile,
    // which may be the red five).
    const addedTile = state.hands[seat][handIdx]
    state.hands[seat] = removeOne(state.hands[seat], addedTile)
    meld.type = 'kan'
    meld.tiles = [...meld.tiles, addedTile]
    meld.added = true
    state.drawnTile = null
    state.chankanTile = addedTile

    const robbers = []
    for (let other = 0; other < 4; other++) {
      if (other === seat) continue
      if (isWinningHand([...state.hands[other], addedTile], state.melds[other], addedTile) && !isFuriten(state, other, addedTile)) {
        const scored = scoreHand(buildWinContext(state, other, addedTile, false))
        if (scored.valid) robbers.push({ seat: other, from: seat, scored, winningTile: addedTile, isTsumo: false })
      }
    }
    if (robbers.length > 0) {
      // Offer chankan ron as a pending call so players can choose.
      const calls = {}
      for (const robber of robbers) calls[robber.seat] = { options: { ron: true }, responded: false, choice: null, chankan: true }
      state.pendingCalls = calls
      state.state = 'callWait'
      state.chankanFrom = seat
      autoResolveCalls(state)
      return state
    }
    state.anyCallMade = true
    revealKanDora(state)
    return drawRinshan(state)
  }
  return state
}

// ---- Call resolution -------------------------------------------------------

function doCallResponse(state, seat, response) {
  if (state.state !== 'callWait' || !state.pendingCalls || !state.pendingCalls[seat]) return state
  // First answer is final — ignore any later response so a ron can't be
  // overwritten by a subsequent (lower-priority) chi/pon, or vice versa.
  if (state.pendingCalls[seat].responded) return state
  state.pendingCalls[seat].responded = true
  state.pendingCalls[seat].choice = response // { type, tiles? } or { type:'pass' }
  return autoResolveCalls(state)
}

function autoResolveCalls(state) {
  const calls = state.pendingCalls
  if (!calls) return state
  // Wait until every eligible seat has responded.
  const allResponded = Object.values(calls).every((entry) => entry.responded)
  if (!allResponded) return state
  return resolveCalls(state)
}

function resolveCalls(state) {
  const calls = state.pendingCalls
  const discard = state.lastDiscard
  const chankan = state.chankanFrom != null

  // Highest priority: ron (possibly multiple).
  const rons = []
  for (const [seatStr, entry] of Object.entries(calls)) {
    if (entry.choice && entry.choice.type === 'ron') {
      const seat = Number(seatStr)
      const isChankan = !!entry.chankan
      const winningTile = discard ? discard.tile : state.chankanTile
      const scored = scoreHand(buildWinContext(state, seat, winningTile, false))
      if (scored.valid) rons.push({ seat, from: chankan ? state.chankanFrom : discard.seat, scored, winningTile, isTsumo: false })
    }
  }
  if (rons.length > 0) {
    // Mark the called tile as taken (ron doesn't remove from discard pile, but
    // we tag it for display).
    state.pendingCalls = null
    state.chankanFrom = null
    return settleWin(state, rons)
  }

  // Players who declined a ron they could have won become temp-furiten.
  for (const [seatStr, entry] of Object.entries(calls)) {
    if (entry.options.ron && (!entry.choice || entry.choice.type === 'pass')) {
      const seat = Number(seatStr)
      state.tempFuriten[seat] = true
      if (state.riichi[seat]) state.furiten[seat] = true
    }
  }

  // If this was a chankan window with no ron, complete the kan.
  if (chankan) {
    const kanSeat = state.chankanFrom
    state.pendingCalls = null
    state.chankanFrom = null
    state.turn = kanSeat
    state.anyCallMade = true
    revealKanDora(state)
    return drawRinshan(state)
  }

  // Next priority: pon / open kan.
  let chosen = null
  for (const [seatStr, entry] of Object.entries(calls)) {
    if (entry.choice && (entry.choice.type === 'pon' || entry.choice.type === 'kan')) {
      chosen = { seat: Number(seatStr), ...entry.choice }
      break
    }
  }
  // Then chi.
  if (!chosen) {
    for (const [seatStr, entry] of Object.entries(calls)) {
      if (entry.choice && entry.choice.type === 'chi') {
        chosen = { seat: Number(seatStr), ...entry.choice }
        break
      }
    }
  }

  state.pendingCalls = null
  if (!chosen) {
    // Everyone passed: clear temp furiten that only applies until next draw is
    // resolved per-seat in beginTurn; advance turn.
    return advanceAfterDiscard(state, discard.seat)
  }
  return performCall(state, chosen, discard)
}

function performCall(state, chosen, discard) {
  const { seat } = chosen
  const tile = discard.tile
  // Remove the called tile from the discarder's pile (it's now in a meld).
  state.discards[discard.seat][discard.index].called = true
  state.anyCallMade = true
  state.firstGoAround = false
  // Any call cancels all outstanding ippatsu.
  state.ippatsu = [false, false, false, false]
  // Clear temp furiten for everyone on a fresh call action.
  state.tempFuriten = [false, false, false, false]

  // Melds keep the actual tiles taken from the hand (and the actual discard), so
  // any red five among them is preserved for display and aka-dora counting.
  if (chosen.type === 'pon') {
    let hand = state.hands[seat]
    const tiles = [tile]
    for (let taken = 0; taken < 2; taken++) {
      const [rest, removed] = takeByBase(hand, baseKind(tile))
      hand = rest
      if (removed) tiles.push(removed)
    }
    state.hands[seat] = hand
    state.melds[seat].push({ type: 'pon', tiles, concealed: false, from: discard.seat })
    state.turn = seat
    state.drawnTile = null
    state.state = 'discard'
    return state
  }
  if (chosen.type === 'kan') {
    let hand = state.hands[seat]
    const tiles = [tile]
    for (let taken = 0; taken < 3; taken++) {
      const [rest, removed] = takeByBase(hand, baseKind(tile))
      hand = rest
      if (removed) tiles.push(removed)
    }
    state.hands[seat] = hand
    state.melds[seat].push({ type: 'kan', tiles, concealed: false, from: discard.seat })
    state.turn = seat
    state.drawnTile = null
    revealKanDora(state)
    return drawRinshan(state)
  }
  if (chosen.type === 'chi') {
    let hand = state.hands[seat]
    const tiles = [tile]
    let usedDiscard = false
    for (const meldTile of chosen.tiles) {
      // Skip the one slot that the discard fills; take the rest from the hand.
      if (!usedDiscard && baseKind(meldTile) === baseKind(tile)) { usedDiscard = true; continue }
      const [rest, removed] = takeByBase(hand, baseKind(meldTile))
      hand = rest
      if (removed) tiles.push(removed)
    }
    state.hands[seat] = hand
    state.melds[seat].push({ type: 'chi', tiles: sortTiles(tiles), concealed: false, from: discard.seat })
    state.turn = seat
    state.drawnTile = null
    state.state = 'discard'
    return state
  }
  return state
}

// ---- Win settlement --------------------------------------------------------

function settleWin(state, wins) {
  const deltas = [0, 0, 0, 0]
  const honbaBonus = state.honba * 300

  for (const win of wins) {
    const { seat, scored, isTsumo, from } = win
    if (isTsumo) {
      if (scored.payment.byDealerTsumo) {
        for (let other = 0; other < 4; other++) {
          if (other === seat) continue
          const pay = scored.payment.tsumoEachNonDealer + state.honba * 100
          deltas[other] -= pay; deltas[seat] += pay
        }
      } else {
        for (let other = 0; other < 4; other++) {
          if (other === seat) continue
          const pay = (other === state.dealer ? scored.payment.tsumoFromDealer : scored.payment.tsumoFromNonDealer) + state.honba * 100
          deltas[other] -= pay; deltas[seat] += pay
        }
      }
    } else {
      const pay = scored.payment.ron + (wins.length === 1 ? honbaBonus : honbaBonus)
      deltas[from] -= pay
      deltas[seat] += pay
    }
  }
  // Riichi sticks (including this round's) go to the (highest-priority) winner.
  const potWinner = wins[0].seat
  deltas[potWinner] += state.riichiSticks * RIICHI_BET

  const newScores = state.scores.map((value, idx) => value + deltas[idx])

  const dealerWon = wins.some((win) => win.seat === state.dealer)
  state.result = {
    type: 'win',
    wins: wins.map((win) => ({
      seat: win.seat,
      from: win.from,
      isTsumo: win.isTsumo,
      winningTile: win.winningTile,
      hand: state.hands[win.seat],
      melds: state.melds[win.seat],
      han: win.scored.han,
      fu: win.scored.fu,
      limitName: win.scored.limitName,
      yaku: win.scored.yaku,
      isYakuman: win.scored.isYakuman,
      payment: win.scored.payment
    })),
    deltas,
    honba: state.honba,
    doraIndicators: state.doraIndicators,
    uraDoraIndicators: wins.some((win) => state.riichi[win.seat]) ? state.uraDoraIndicators : [],
    dealerWon
  }
  state.scores = newScores
  state.riichiSticks = 0
  state.phase = 'roundEnd'
  state.state = 'over'
  return state
}

function exhaustiveDraw(state) {
  const tenpai = []
  for (let seat = 0; seat < 4; seat++) {
    const waits = waitingTiles(state.hands[seat], state.melds[seat])
    tenpai.push(waits.length > 0)
  }
  const tenpaiCount = tenpai.filter(Boolean).length
  const deltas = [0, 0, 0, 0]
  if (tenpaiCount > 0 && tenpaiCount < 4) {
    const notenCount = 4 - tenpaiCount
    const perTenpai = 3000 / tenpaiCount
    const perNoten = 3000 / notenCount
    for (let seat = 0; seat < 4; seat++) {
      deltas[seat] = tenpai[seat] ? perTenpai : -perNoten
    }
  }
  state.scores = state.scores.map((value, idx) => value + deltas[idx])
  state.result = {
    type: 'draw',
    tenpai,
    deltas,
    hands: state.hands.map((hand, seat) => (tenpai[seat] ? hand : null)),
    doraIndicators: state.doraIndicators
  }
  state.phase = 'roundEnd'
  state.state = 'over'
  state._dealerKeepsByTenpai = tenpai[state.dealer]
  return state
}

// ---- Advancing to the next round / game over -------------------------------

export function nextRound(game) {
  const result = game.result
  const dealerRenchan = result.type === 'win'
    ? result.dealerWon
    : game._dealerKeepsByTenpai

  let dealer = game.dealer
  let roundWind = game.roundWind
  let roundNumber = game.roundNumber
  let honba = game.honba

  if (dealerRenchan) {
    honba += 1
  } else {
    honba = result.type === 'draw' ? honba + 1 : 0
    dealer = nextSeat(dealer)
    if (dealer === 0) {
      // A full lap of the current wind just finished. If that was the match's
      // final wind, the game is over; keep the finished round's wind/number and
      // its result so the final-standings dialog still shows (rather than rolling
      // into a round that will never be played). Otherwise advance to the next wind.
      if (roundWind === game.maxRoundWind) {
        return { ...game, phase: 'gameEnd' }
      }
      roundWind = nextWind(roundWind)
      roundNumber = 1
    } else {
      roundNumber += 1
    }
  }

  // A bankruptcy ends the match immediately, whatever the round.
  if (game.scores.some((value) => value < 0)) {
    return { ...game, phase: 'gameEnd' }
  }

  return startRound({ ...game, dealer, roundWind, roundNumber, honba, result: null })
}

const WIND_ORDER = ['1z', '2z', '3z', '4z'] // East South West North
const nextWind = (wind) => WIND_ORDER[WIND_ORDER.indexOf(wind) + 1] || wind

// ---- Per-player view (hides hidden information) ----------------------------

export function viewFor(state, playerId) {
  const you = state.players.findIndex((player) => player.id === playerId)
  const reveal = state.phase === 'roundEnd' || state.phase === 'gameEnd'

  const view = {
    phase: state.phase,
    players: state.players,
    scores: state.scores,
    dealer: state.dealer,
    roundWind: state.roundWind,
    roundNumber: state.roundNumber,
    honba: state.honba,
    riichiSticks: state.riichiSticks,
    you,
    turn: state.turn,
    state: state.state,
    melds: state.melds,
    discards: state.discards,
    riichi: state.riichi,
    doraIndicators: state.doraIndicators,
    wallCount: state.wall ? state.wall.length : 0,
    result: state.result
  }

  if (state.hands) {
    view.hands = state.hands.map((hand, seat) =>
      (reveal || seat === you) ? hand : hand.length)
    view.handCounts = state.hands.map((hand) => hand.length)
    // Your own tenpai waits (your private info — never another seat's).
    if (you >= 0 && state.hands[you]) {
      view.yourWaits = waitingTiles(state.hands[you], state.melds[you])
    }
  }
  if (reveal && state.uraDoraIndicators) view.uraDoraIndicators = state.uraDoraIndicators

  // Your private draw + the actions available to you right now.
  if (you === state.turn && state.state === 'discard') {
    view.drawnTile = state.drawnTile
    view.selfOptions = selfOptions(state, you)
  }
  // Your call options, if any are pending. Once you've responded, withhold the
  // options so the UI stops offering buttons and can show that it's now waiting
  // on the other seats (a call window only resolves once everyone has answered).
  if (state.state === 'callWait' && state.pendingCalls && state.pendingCalls[you]) {
    view.callPending = true
    if (state.pendingCalls[you].responded) {
      view.callResponded = true
    } else {
      view.callOptions = state.pendingCalls[you].options
      view.callTile = state.lastDiscard ? state.lastDiscard.tile : state.chankanTile
    }
  } else if (state.state === 'callWait') {
    view.callPending = true // someone else is deciding
  }

  return view
}
