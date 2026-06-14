// Winning-hand (agari) detection and decomposition.
// Produces every valid parse of a 14-tile hand so the scorer can pick the
// highest-scoring interpretation.

import { ALL_KINDS, isTerminalOrHonor } from './tiles.js'

// Fast index <-> kind mapping. Index layout:
//   0..8   1m..9m
//   9..17  1p..9p
//   18..26 1s..9s
//   27..33 1z..7z
const KIND_INDEX = {}
ALL_KINDS.forEach((kind, idx) => { KIND_INDEX[kind] = idx })
export const indexOfKind = (kind) => KIND_INDEX[kind]
export const kindOfIndex = (idx) => ALL_KINDS[idx]

const isNumericIndex = (idx) => idx < 27
const rankInSuit = (idx) => idx % 9 // 0-based; only meaningful for numeric tiles

export function countsFromTiles(tiles) {
  const counts = new Array(34).fill(0)
  for (const tile of tiles) counts[KIND_INDEX[tile]]++
  return counts
}

// Recursively split `counts` into `needed` sets, fully consuming all tiles.
// Always consumes the lowest remaining tile to keep parses canonical (no dups).
function collectSets(counts, needed, current, out) {
  let lowest = -1
  for (let idx = 0; idx < 34; idx++) {
    if (counts[idx] > 0) { lowest = idx; break }
  }
  if (lowest === -1) {
    if (needed === 0) out.push(current.slice())
    return
  }
  if (needed === 0) return // tiles left over but no sets allowed

  // Triplet (kotsu) using the lowest tile.
  if (counts[lowest] >= 3) {
    counts[lowest] -= 3
    current.push({ type: 'kotsu', idx: lowest })
    collectSets(counts, needed - 1, current, out)
    current.pop()
    counts[lowest] += 3
  }
  // Run (shuntsu) starting at the lowest tile.
  if (isNumericIndex(lowest) && rankInSuit(lowest) <= 6 &&
      counts[lowest + 1] > 0 && counts[lowest + 2] > 0) {
    counts[lowest]--; counts[lowest + 1]--; counts[lowest + 2]--
    current.push({ type: 'shuntsu', idx: lowest })
    collectSets(counts, needed - 1, current, out)
    current.pop()
    counts[lowest]++; counts[lowest + 1]++; counts[lowest + 2]++
  }
}

// All standard (4 sets + pair) decompositions of the concealed tiles, given
// how many sets are already locked in melds.
function standardParses(counts, neededSets) {
  const parses = []
  for (let pairIdx = 0; pairIdx < 34; pairIdx++) {
    if (counts[pairIdx] >= 2) {
      counts[pairIdx] -= 2
      const setsOut = []
      collectSets(counts, neededSets, [], setsOut)
      counts[pairIdx] += 2
      for (const sets of setsOut) {
        parses.push({
          kind: 'standard',
          pairIdx,
          sets // concealed sets only; meld sets added by caller
        })
      }
    }
  }
  return parses
}

// Seven pairs (chiitoitsu): 7 distinct kinds, each exactly 2.
function chiitoiParse(counts) {
  let pairs = 0
  for (let idx = 0; idx < 34; idx++) {
    if (counts[idx] === 0) continue
    if (counts[idx] === 2) pairs++
    else return null
  }
  return pairs === 7 ? { kind: 'chiitoi' } : null
}

// Thirteen orphans (kokushi musou).
const TERMINAL_HONOR_INDICES = ALL_KINDS
  .map((kind, idx) => (isTerminalOrHonor(kind) ? idx : -1))
  .filter((idx) => idx >= 0)
function kokushiParse(counts, winningIdx) {
  let pairIdx = -1
  for (let pos = 0; pos < TERMINAL_HONOR_INDICES.length; pos++) {
    const idx = TERMINAL_HONOR_INDICES[pos]
    const value = counts[idx]
    if (value === 0) return null
    if (value === 2) { if (pairIdx !== -1) return null; pairIdx = idx }
    else if (value !== 1) return null
  }
  // every non-orphan must be absent
  for (let idx = 0; idx < 34; idx++) {
    if (!TERMINAL_HONOR_INDICES.includes(idx) && counts[idx] !== 0) return null
  }
  // 13-sided wait: held all 13 singles, won the pair tile
  const thirteenSided = pairIdx === winningIdx
  return { kind: 'kokushi', thirteenSided }
}

// Main entry. `concealed` is the array of concealed tile kinds INCLUDING the
// winning tile. `melds` is the array of declared melds (each consumes a set).
// Returns an array of parses (possibly empty if not a winning hand).
export function findAgari(concealed, melds, winningTile) {
  const counts = countsFromTiles(concealed)
  const neededSets = 4 - melds.filter((meld) => meld.type !== 'pair').length
  const parses = []

  // Standard hands require melds + concealed to total 4 sets + 1 pair.
  for (const parse of standardParses(counts, neededSets)) parses.push(parse)

  // Chiitoi / kokushi only valid with a fully concealed 14-tile hand.
  if (melds.length === 0 && concealed.length === 14) {
    const chiitoi = chiitoiParse(counts)
    if (chiitoi) parses.push(chiitoi)
    const kokushi = kokushiParse(counts, KIND_INDEX[winningTile])
    if (kokushi) parses.push(kokushi)
  }
  return parses
}

export const isWinningHand = (concealed, melds, winningTile) =>
  findAgari(concealed, melds, winningTile).length > 0

// Tenpai test: is the hand (13 tiles concealed + melds) one tile from winning?
// Returns the array of waiting tile kinds (empty if not tenpai).
export function waitingTiles(concealed, melds) {
  const waits = []
  for (const candidate of ALL_KINDS) {
    // can't draw a 5th copy
    const inHand = concealed.filter((tile) => tile === candidate).length
    const inMelds = melds.reduce(
      (sum, meld) => sum + meld.tiles.filter((tile) => tile === candidate).length,
      0
    )
    if (inHand + inMelds >= 4) continue
    if (isWinningHand([...concealed, candidate], melds, candidate)) waits.push(candidate)
  }
  return waits
}
