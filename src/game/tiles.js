// Tile representation.
// A tile "kind" is a 2-char string: rank + suit letter (riichi/tenhou standard).
//   '1m'..'9m'  manzu  (characters)
//   '1p'..'9p'  pinzu  (circles / dots)
//   '1s'..'9s'  souzu  (bamboo)
//   '1z'..'7z'  honors: 1=East 2=South 3=West 4=North 5=Haku(white) 6=Hatsu(green) 7=Chun(red)
// The physical wall is just an array of kind strings (4 of each); a tile's
// identity within the game is its index in arrays, not the string.

export const SUITS = ['m', 'p', 's', 'z']
export const WINDS = ['1z', '2z', '3z', '4z'] // E S W N
export const DRAGONS = ['5z', '6z', '7z'] // Haku Hatsu Chun

export const ALL_KINDS = (() => {
  const kinds = []
  for (const suit of ['m', 'p', 's']) {
    for (let rank = 1; rank <= 9; rank++) kinds.push(`${rank}${suit}`)
  }
  for (let rank = 1; rank <= 7; rank++) kinds.push(`${rank}z`)
  return kinds
})()

// Red fives (akadora) use tenhou notation '0m'/'0p'/'0s'. A red five is
// mechanically an ordinary five — rankOf treats the '0' rank as 5 — but counts as
// one extra dora when it lands in a winning hand. `baseKind` strips the redness
// for all rule logic; only display and aka-dora counting look at the red kind.
export const RED_FIVE_KINDS = ['0m', '0p', '0s']
export const isRedFive = (tile) => tile[0] === '0'
export const baseKind = (tile) => (tile[0] === '0' ? `5${tile[1]}` : tile)

export const suitOf = (tile) => tile[1]
export const rankOf = (tile) => { const rank = Number(tile[0]); return rank === 0 ? 5 : rank }
export const isHonor = (tile) => tile[1] === 'z'
export const isWind = (tile) => tile[1] === 'z' && rankOf(tile) <= 4
export const isDragon = (tile) => tile[1] === 'z' && rankOf(tile) >= 5
export const isTerminal = (tile) => !isHonor(tile) && (rankOf(tile) === 1 || rankOf(tile) === 9)
export const isTerminalOrHonor = (tile) => isHonor(tile) || isTerminal(tile)
// "Green" tiles for ryuuiisou
export const isGreen = (tile) => ['2s', '3s', '4s', '6s', '8s', '6z'].includes(tile)

// Build a fresh, shuffled 136-tile wall. With `aka`, one 5 of each suit is
// swapped for its red variant ('5m' -> '0m', etc.) before shuffling.
export function buildWall(rng = Math.random, aka = false) {
  const wall = []
  for (const kind of ALL_KINDS) {
    for (let copy = 0; copy < 4; copy++) wall.push(kind)
  }
  if (aka) {
    for (const suit of ['m', 'p', 's']) {
      const idx = wall.indexOf(`5${suit}`)
      if (idx !== -1) wall[idx] = `0${suit}`
    }
  }
  // Fisher-Yates
  for (let idx = wall.length - 1; idx > 0; idx--) {
    const swap = Math.floor(rng() * (idx + 1))
    ;[wall[idx], wall[swap]] = [wall[swap], wall[idx]]
  }
  return wall
}

// The dora is the tile FOLLOWING the indicator, wrapping within its group.
export function doraFromIndicator(indicator) {
  const suit = suitOf(indicator)
  const rank = rankOf(indicator)
  if (suit === 'z') {
    if (rank <= 4) return `${(rank % 4) + 1}z` // winds wrap E->S->W->N->E
    return `${((rank - 5 + 1) % 3) + 5}z` // dragons wrap Haku->Hatsu->Chun->Haku
  }
  return `${(rank % 9) + 1}${suit}` // 1..9 wrap
}

// Sorting: m < p < s < z, then by rank.
const SUIT_ORDER = { m: 0, p: 1, s: 2, z: 3 }
export function compareTiles(left, right) {
  if (left[1] !== right[1]) return SUIT_ORDER[left[1]] - SUIT_ORDER[right[1]]
  return rankOf(left) - rankOf(right)
}
export const sortTiles = (tiles) => [...tiles].sort(compareTiles)

// Convert a tile list to a count map keyed by kind.
export function toCounts(tiles) {
  const counts = {}
  for (const tile of tiles) counts[tile] = (counts[tile] || 0) + 1
  return counts
}

// Remove one occurrence of `tile` from `tiles`, returning a new array.
export function removeOne(tiles, tile) {
  const idx = tiles.indexOf(tile)
  if (idx === -1) return tiles.slice()
  return tiles.slice(0, idx).concat(tiles.slice(idx + 1))
}

// Human-readable labels.
const HONOR_NAMES = ['East', 'South', 'West', 'North', 'White', 'Green', 'Red']
const SUIT_NAMES = { m: 'Man', p: 'Pin', s: 'Sou' }
export function tileName(tile) {
  if (isHonor(tile)) return HONOR_NAMES[rankOf(tile) - 1]
  return rankOf(tile) + ' ' + SUIT_NAMES[suitOf(tile)]
}

// Beginner-friendly full name, e.g. "5 Circles", "East Wind", "Red Dragon".
const SUIT_FULL = { m: 'Characters', p: 'Circles', s: 'Bamboo' }
const HONOR_FULL = ['East Wind', 'South Wind', 'West Wind', 'North Wind', 'White Dragon', 'Green Dragon', 'Red Dragon']
export function tileFullName(tile) {
  if (isHonor(tile)) return HONOR_FULL[rankOf(tile) - 1]
  return rankOf(tile) + ' ' + SUIT_FULL[suitOf(tile)]
}

// Unicode mahjong glyphs (used by the Tile component as a fallback / face).
const GLYPHS = {
  m: ['🀇', '🀈', '🀉', '🀊', '🀋', '🀌', '🀍', '🀎', '🀏'],
  p: ['🀙', '🀚', '🀛', '🀜', '🀝', '🀞', '🀟', '🀠', '🀡'],
  s: ['🀐', '🀑', '🀒', '🀓', '🀔', '🀕', '🀖', '🀗', '🀘'],
  z: ['🀀', '🀁', '🀂', '🀃', '🀆', '🀅', '🀄']
}
export function tileGlyph(tile) {
  return GLYPHS[suitOf(tile)][rankOf(tile) - 1]
}
export const TILE_BACK = '🀫'
