// Computer-player AI. Pure decision functions the host runs for any seat that
// isn't a connected human (filled-in seats, or a seat whose player left).
//
// The bot only ever reads its OWN hand and the public board, never another
// seat's concealed tiles, so it plays on the same information a fair player has.
// Strategy is deliberately "solid & safe": always take a win, riichi when
// tenpai, otherwise discard for maximum hand efficiency (lowest shanten, then
// widest acceptance). It always answers a ron it can win.
//
// It will pon/chi to advance, but only a call that keeps a path to a yaku (a
// yakuhai triplet or an all-simples tanyao shape) — opening the hand forfeits
// riichi/menzen-tsumo, and a yakuless open hand can never win.
//
// A `difficulty` knob weakens that play: easier bots sometimes shed a random tile
// instead of the efficient one, and the easiest ones call loosely (even into a
// yakuless hand, the classic beginner trap). 'hard' is the flawless, deterministic
// baseline; 'easy'/'normal' discard worse and call less soundly.

import {
  ALL_KINDS, baseKind, isDragon, isRedFive, isTerminalOrHonor, removeOne
} from './tiles.js'
import { countsFromTiles, waitingTiles } from './agari.js'
import { selfOptions } from './engine.js'

const isNumericIndex = (idx) => idx < 27
const rankInSuit = (idx) => idx % 9 // 0-based rank within a numeric suit

// Indices (into the 34-kind space) of the terminals and honors.
const TERMINAL_HONOR_INDICES = ALL_KINDS
  .map((kind, idx) => (isTerminalOrHonor(kind) ? idx : -1))
  .filter((idx) => idx >= 0)

// ---- Shanten (distance from tenpai) ----------------------------------------

// Standard 4-sets-plus-a-pair shanten via exhaustive decomposition of the
// concealed counts. `meldsDone` is the number of sets already locked in melds.
// At each leaf we have (sets, partials, hasPair); the four set-slots cap how
// many partials can still count, and a reserved pair shaves one more away.
function standardShanten(counts, meldsDone) {
  let best = 8
  const dfs = (start, sets, partials, hasPair) => {
    let idx = start
    while (idx < 34 && counts[idx] === 0) idx++
    if (idx === 34) {
      const totalSets = sets + meldsDone
      let usablePartials = partials
      const slotsLeft = 4 - totalSets
      if (usablePartials > slotsLeft) usablePartials = slotsLeft < 0 ? 0 : slotsLeft
      const shanten = 8 - 2 * totalSets - usablePartials - hasPair
      if (shanten < best) best = shanten
      return
    }
    // Complete triplet.
    if (counts[idx] >= 3) {
      counts[idx] -= 3
      dfs(idx, sets + 1, partials, hasPair)
      counts[idx] += 3
    }
    // Complete run.
    if (isNumericIndex(idx) && rankInSuit(idx) <= 6 && counts[idx + 1] > 0 && counts[idx + 2] > 0) {
      counts[idx]--; counts[idx + 1]--; counts[idx + 2]--
      dfs(idx, sets + 1, partials, hasPair)
      counts[idx]++; counts[idx + 1]++; counts[idx + 2]++
    }
    // Pair reserved as the hand's head.
    if (!hasPair && counts[idx] >= 2) {
      counts[idx] -= 2
      dfs(idx, sets, partials, 1)
      counts[idx] += 2
    }
    // Pair used as a partial set (toward a triplet).
    if (counts[idx] >= 2) {
      counts[idx] -= 2
      dfs(idx, sets, partials + 1, hasPair)
      counts[idx] += 2
    }
    // Two-tile partial run (idx, idx+1).
    if (isNumericIndex(idx) && rankInSuit(idx) <= 7 && counts[idx + 1] > 0) {
      counts[idx]--; counts[idx + 1]--
      dfs(idx, sets, partials + 1, hasPair)
      counts[idx]++; counts[idx + 1]++
    }
    // Kanchan partial (idx, idx+2).
    if (isNumericIndex(idx) && rankInSuit(idx) <= 6 && counts[idx + 2] > 0) {
      counts[idx]--; counts[idx + 2]--
      dfs(idx, sets, partials + 1, hasPair)
      counts[idx]++; counts[idx + 2]++
    }
    // Leave this tile floating.
    counts[idx]--
    dfs(idx, sets, partials, hasPair)
    counts[idx]++
  }
  dfs(0, 0, 0, 0)
  return best
}

function chiitoiShanten(counts) {
  let pairs = 0
  let kinds = 0
  for (let idx = 0; idx < 34; idx++) {
    if (counts[idx] > 0) kinds++
    if (counts[idx] >= 2) pairs++
  }
  return 6 - pairs + Math.max(0, 7 - kinds)
}

function kokushiShanten(counts) {
  let kinds = 0
  let hasPair = 0
  for (const idx of TERMINAL_HONOR_INDICES) {
    if (counts[idx] > 0) { kinds++; if (counts[idx] >= 2) hasPair = 1 }
  }
  return 13 - kinds - hasPair
}

// Shanten of a 13-tile concealed hand plus its declared melds. Chiitoi/kokushi
// only apply to a fully concealed hand.
function handShanten(tiles, melds) {
  const counts = countsFromTiles(tiles)
  let shanten = standardShanten(counts, melds.length)
  if (melds.length === 0) {
    shanten = Math.min(shanten, chiitoiShanten(counts), kokushiShanten(counts))
  }
  return shanten
}

// ---- Difficulty ------------------------------------------------------------

// Per-level behavior knobs:
//   mistakeChance  - how often the bot sheds a random tile, not its best discard.
//   callChance     - how often it actually pounces on a worthwhile pon/chi.
//   looseCalls     - if true it'll also call into a yakuless hand (beginner trap).
//   maxCallShanten - only call when the result is this close to tenpai or better.
// 'hard' is flawless and deterministic (the tests rely on that default): it always
// takes a sound call. Easier levels misdiscard more and call less soundly.
const DIFFICULTY = {
  easy: { mistakeChance: 0.55, callChance: 0.85, looseCalls: true, maxCallShanten: 2 },
  normal: { mistakeChance: 0.2, callChance: 0.7, looseCalls: false, maxCallShanten: 1 },
  hard: { mistakeChance: 0, callChance: 1, looseCalls: false, maxCallShanten: 1 }
}

const profileFor = (difficulty) => DIFFICULTY[difficulty] || DIFFICULTY.hard

const SEAT_WINDS = ['1z', '2z', '3z', '4z'] // East South West North
const seatWindFor = (seat, dealer) => SEAT_WINDS[(seat - dealer + 4) % 4]
const isYakuhaiKind = (kind, roundWind, seatWind) =>
  isDragon(kind) || kind === roundWind || kind === seatWind

// Remove one tile whose base kind matches `kind` (a red five counts as its five).
function removeBase(tiles, kind) {
  const idx = tiles.findIndex((tile) => baseKind(tile) === kind)
  return idx < 0 ? tiles.slice() : tiles.slice(0, idx).concat(tiles.slice(idx + 1))
}

// ---- Discard choice --------------------------------------------------------

// How many copies of `kind` are already accounted for in the hand + melds.
function copiesUsed(kind, tiles, melds) {
  let used = tiles.filter((tile) => baseKind(tile) === kind).length
  for (const meld of melds) used += meld.tiles.filter((tile) => baseKind(tile) === kind).length
  return used
}

// Number of distinct tile kinds whose draw would lower the hand's shanten — the
// classic "ukeire" measure of how wide a hand's acceptance is.
function acceptance(tiles, melds, shanten) {
  let total = 0
  for (const kind of ALL_KINDS) {
    if (copiesUsed(kind, tiles, melds) >= 4) continue
    if (handShanten([...tiles, kind], melds) < shanten) total++
  }
  return total
}

// Pick the discard from a 14-tile hand that keeps the hand strongest: lowest
// resulting shanten, then widest acceptance, then preferring to shed an isolated
// terminal/honor, and never throwing away a red five if anything else is equal.
export function chooseDiscard(hand, melds, difficulty = 'hard') {
  const candidates = [...new Set(hand)]
  // Weaker bots sometimes just shed a random held tile rather than the best one.
  const profile = profileFor(difficulty)
  if (candidates.length > 1 && Math.random() < profile.mistakeChance) {
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  let best = null
  let bestTile = hand[0]
  for (const tile of candidates) {
    const rest = removeOne(hand, tile)
    const shanten = handShanten(rest, melds)
    const candidate = {
      shanten,
      ukeire: acceptance(rest, melds, shanten),
      red: isRedFive(tile) ? 1 : 0,
      terminalOrHonor: isTerminalOrHonor(baseKind(tile)) ? 1 : 0
    }
    if (!best || betterDiscard(candidate, best)) {
      best = candidate
      bestTile = tile
    }
  }
  return bestTile
}

function betterDiscard(candidate, incumbent) {
  if (candidate.shanten !== incumbent.shanten) return candidate.shanten < incumbent.shanten
  if (candidate.ukeire !== incumbent.ukeire) return candidate.ukeire > incumbent.ukeire
  if (candidate.red !== incumbent.red) return candidate.red < incumbent.red // keep reds
  if (candidate.terminalOrHonor !== incumbent.terminalOrHonor) {
    return candidate.terminalOrHonor > incumbent.terminalOrHonor // shed dead-weight first
  }
  return false
}

// Among the tiles a riichi declaration may discard, keep the one with the widest
// wait (most winning tiles), preferring not to discard a red five on a tie.
function bestRiichiDiscard(hand, melds, riichiTiles) {
  let bestTile = riichiTiles[0]
  let bestWaits = -1
  let bestRed = 1
  for (const tile of riichiTiles) {
    const waits = waitingTiles(removeOne(hand, tile), melds).length
    const red = isRedFive(tile) ? 1 : 0
    if (waits > bestWaits || (waits === bestWaits && red < bestRed)) {
      bestWaits = waits
      bestRed = red
      bestTile = tile
    }
  }
  return bestTile
}

// ---- Public decisions ------------------------------------------------------

// The action a bot takes on its own turn (after drawing): win, riichi, or
// discard. While locked in riichi it can only tsumogiri the drawn tile.
export function botTurnAction(state, seat, difficulty = 'hard') {
  const options = selfOptions(state, seat)
  if (options.tsumo) return { type: 'tsumo' }

  const hand = state.hands[seat]
  const melds = state.melds[seat]

  if (state.riichi[seat]) {
    // Hand is locked — the only legal discard is the tile just drawn.
    return { type: 'discard', tile: state.drawnTile }
  }
  // Always riichi when offered — any player would; the skill gap is the discard.
  if (options.riichi && options.riichi.length > 0) {
    return { type: 'riichi', tile: bestRiichiDiscard(hand, melds, options.riichi) }
  }
  return { type: 'discard', tile: chooseDiscard(hand, melds, difficulty) }
}

// The concealed tiles a call leaves behind, plus the base kinds of the meld it
// forms — enough to judge the resulting shanten and whether a yaku survives.
function callOutcome(hand, tile, candidate) {
  const base = baseKind(tile)
  if (candidate.type === 'pon') {
    return { remaining: removeBase(removeBase(hand, base), base), meldKinds: [base, base, base] }
  }
  // Chi: the sequence holds the called discard plus two tiles from the hand.
  let remaining = hand
  let skippedCalled = false
  for (const seqTile of candidate.tiles) {
    if (!skippedCalled && seqTile === tile) { skippedCalled = true; continue }
    remaining = removeBase(remaining, baseKind(seqTile))
  }
  return { remaining, meldKinds: candidate.tiles.map(baseKind) }
}

// Could the open hand this call produces still finish with a yaku? Safe-but-narrow:
// an existing/forming yakuhai triplet, or an all-simples (tanyao) shape.
function callKeepsYaku(outcome, melds, roundWind, seatWind) {
  const yakuhaiMeld = (meld) => (meld.type === 'pon' || meld.type === 'kan') &&
    isYakuhaiKind(baseKind(meld.tiles[0]), roundWind, seatWind)
  if (melds.some(yakuhaiMeld)) return true
  const { meldKinds, remaining } = outcome
  if (meldKinds[0] === meldKinds[1] && meldKinds[1] === meldKinds[2] &&
    isYakuhaiKind(meldKinds[0], roundWind, seatWind)) return true
  const simple = (kind) => !isTerminalOrHonor(kind)
  return remaining.every((tile) => simple(baseKind(tile))) &&
    meldKinds.every(simple) &&
    melds.every((meld) => meld.tiles.every((tile) => simple(baseKind(tile))))
}

// How a bot answers a pending call: always take a winning ron; otherwise consider
// a pon/chi that advances the hand while keeping a yaku reachable (looser bots
// will also grab one that doesn't). Declines kan and anything not worth opening.
export function botCallResponse(state, seat, options, difficulty = 'hard') {
  if (options.ron) return { type: 'ron' }

  const hand = state.hands?.[seat]
  const melds = state.melds?.[seat]
  const tile = state.lastDiscard?.tile
  if (!hand || !melds || !tile) return { type: 'pass' }

  const profile = profileFor(difficulty)
  const roundWind = state.roundWind
  const seatWind = seatWindFor(seat, state.dealer)
  const shantenBefore = handShanten(hand, melds)

  const candidates = []
  if (options.pon) candidates.push({ type: 'pon' })
  for (const sequence of options.chi || []) candidates.push({ type: 'chi', tiles: sequence })

  // Pick the call that brings the hand closest to a win, within the level's reach.
  let best = null
  for (const candidate of candidates) {
    const outcome = callOutcome(hand, tile, candidate)
    const shanten = handShanten(outcome.remaining, [...melds, { tiles: outcome.meldKinds }])
    if (shanten >= shantenBefore || shanten > profile.maxCallShanten) continue
    if (!profile.looseCalls && !callKeepsYaku(outcome, melds, roundWind, seatWind)) continue
    if (!best || shanten < best.shanten) best = { candidate, shanten }
  }
  if (!best || Math.random() >= profile.callChance) return { type: 'pass' }

  const { candidate } = best
  return candidate.type === 'chi' ? { type: 'chi', tiles: candidate.tiles } : { type: 'pon' }
}
