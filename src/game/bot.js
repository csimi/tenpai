// Computer-player AI. Pure decision functions the host runs for any seat that
// isn't a connected human (filled-in seats, or a seat whose player left).
//
// The bot only ever reads its OWN hand and the public board, never another
// seat's concealed tiles, so it plays on the same information a fair player has.
// Strategy is deliberately "solid & safe": always take a win, riichi when
// tenpai, otherwise discard for maximum hand efficiency (lowest shanten, then
// widest acceptance). It passes on pon/chi so it never strands itself with a
// yakuless open hand — but it always answers a ron it can win.

import {
  ALL_KINDS, baseKind, isRedFive, isTerminalOrHonor, removeOne
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
export function chooseDiscard(hand, melds) {
  const candidates = [...new Set(hand)]
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
export function botTurnAction(state, seat) {
  const options = selfOptions(state, seat)
  if (options.tsumo) return { type: 'tsumo' }

  const hand = state.hands[seat]
  const melds = state.melds[seat]

  if (state.riichi[seat]) {
    // Hand is locked — the only legal discard is the tile just drawn.
    return { type: 'discard', tile: state.drawnTile }
  }
  if (options.riichi && options.riichi.length > 0) {
    return { type: 'riichi', tile: bestRiichiDiscard(hand, melds, options.riichi) }
  }
  return { type: 'discard', tile: chooseDiscard(hand, melds) }
}

// How a bot answers a pending call: always take a winning ron; otherwise pass
// (declining pon/chi/kan keeps the hand closed and its yaku intact).
export function botCallResponse(options) {
  if (options.ron) return { type: 'ron' }
  return { type: 'pass' }
}
