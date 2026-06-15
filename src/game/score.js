// Yaku detection, fu/han computation, and point calculation.
// Works off the parses produced by agari.js and picks the highest-scoring one.

import { findAgari, kindOfIndex } from './agari.js'
import {
  suitOf, rankOf, isHonor, isDragon, isTerminalOrHonor, isTerminal, isGreen,
  baseKind, isRedFive
} from './tiles.js'

// Expand a normalized group into its constituent tile kinds.
function groupTiles(group) {
  if (group.shape === 'run') {
    const suit = suitOf(group.tile)
    const lo = rankOf(group.tile)
    return [`${lo}${suit}`, `${lo + 1}${suit}`, `${lo + 2}${suit}`]
  }
  const count = group.shape === 'kan' ? 4 : 3
  return new Array(count).fill(group.tile)
}

// Build the normalized group list for a standard parse, choosing which
// concealed group the winning tile completed (placement) and the wait shape.
function buildPlacements(parse, ctx) {
  // Red fives are ordinary fives for shape/yaku/dora purposes (their extra han is
  // added separately as aka dora), so normalize meld tiles to their base kind.
  const meldGroups = ctx.melds.map((meld) => ({
    shape: meld.type === 'chi' ? 'run' : (meld.type === 'kan' ? 'kan' : 'triplet'),
    tile: meld.type === 'chi'
      ? meld.tiles.map(baseKind).sort((left, right) => rankOf(left) - rankOf(right))[0]
      : baseKind(meld.tiles[0]),
    concealed: !!meld.concealed,
    fromMeld: true
  }))
  const concealedGroups = parse.sets.map((set) => ({
    shape: set.type === 'shuntsu' ? 'run' : 'triplet',
    tile: kindOfIndex(set.idx),
    concealed: true,
    fromMeld: false
  }))
  const pair = kindOfIndex(parse.pairIdx)

  const allGroups = [...meldGroups, ...concealedGroups]
  const placements = []
  const winTile = baseKind(ctx.winningTile)
  const winRank = rankOf(winTile)

  // The winning tile completes one of the concealed groups, or the pair (tanki).
  // `completedIndex` flags the group the win tile finished — relevant only on
  // ron, where a triplet finished by the discard counts as open (minko) for fu
  // and is not concealed for sanankou/suuankou. Menzen status is unaffected by
  // ron and is derived from called melds, not from this flag.
  concealedGroups.forEach((group, position) => {
    const tiles = groupTiles(group)
    if (!tiles.includes(winTile)) return
    let wait = 'shanpon'
    if (group.shape === 'run') {
      const lo = rankOf(group.tile)
      if (winRank === lo + 1) wait = 'kanchan'
      else if ((lo === 1 && winRank === 3) || (lo === 7 && winRank === 7)) wait = 'penchan'
      else wait = 'ryanmen'
    }
    placements.push({ groups: allGroups, pair, wait, completedIndex: meldGroups.length + position })
  })
  if (pair === winTile) {
    placements.push({ groups: allGroups, pair, wait: 'tanki', completedIndex: -1 })
  }
  if (placements.length === 0) {
    placements.push({ groups: allGroups, pair, wait: 'none', completedIndex: -1 })
  }
  return placements
}

// A triplet/kan is "effectively concealed" (counts as anko) unless it was the
// group completed by a ron discard.
function effectivelyConcealed(group, idx, placement, ctx) {
  if (!group.concealed) return false
  if (!ctx.isTsumo && idx === placement.completedIndex && group.shape !== 'run') return false
  return true
}

const isYakuhaiPair = (pairKind, ctx) =>
  isDragon(pairKind) || pairKind === ctx.seatWind || pairKind === ctx.roundWind

// ---- Standard-hand yaku ----------------------------------------------------

function standardYaku(placement, ctx, menzen) {
  const { groups, pair } = placement
  const yaku = []
  const runs = groups.filter((group) => group.shape === 'run')
  const triplets = groups.filter((group) => group.shape !== 'run')
  const concealedTriplets = groups.filter(
    (group, idx) => group.shape !== 'run' && effectivelyConcealed(group, idx, placement, ctx)
  )
  const allTiles = groups.flatMap(groupTiles).concat([pair, pair])

  const add = (name, han) => yaku.push({ name, han })

  // --- Yakuman first ---
  const yakuman = []
  // Daisangen
  const dragonTriplets = triplets.filter((group) => isDragon(group.tile))
  if (dragonTriplets.length === 3) yakuman.push({ name: 'Daisangen', power: 1 })
  // Suuankou (four concealed triplets)
  if (triplets.length === 4 && concealedTriplets.length === 4) {
    yakuman.push({ name: 'Suuankou', power: placement.wait === 'tanki' ? 2 : 1 })
  }
  // Winds
  const windTriplets = triplets.filter((group) => suitOf(group.tile) === 'z' && rankOf(group.tile) <= 4)
  const pairIsWind = suitOf(pair) === 'z' && rankOf(pair) <= 4
  if (windTriplets.length === 4) yakuman.push({ name: 'Daisuushi', power: 2 })
  else if (windTriplets.length === 3 && pairIsWind) yakuman.push({ name: 'Shousuushi', power: 1 })
  // Tsuuiisou (all honors)
  if (allTiles.every(isHonor)) yakuman.push({ name: 'Tsuuiisou', power: 1 })
  // Chinroutou (all terminals)
  if (allTiles.every((tile) => isTerminal(tile))) yakuman.push({ name: 'Chinroutou', power: 1 })
  // Ryuuiisou (all green)
  if (allTiles.every(isGreen)) yakuman.push({ name: 'Ryuuiisou', power: 1 })
  // Suukantsu
  if (groups.filter((group) => group.shape === 'kan').length === 4) yakuman.push({ name: 'Suukantsu', power: 1 })
  // Chuuren poutou (nine gates) — full flush 1112345678999 shape, menzen
  if (menzen && allTiles.length === 14) {
    const suit = suitOf(allTiles[0])
    if (suit !== 'z' && allTiles.every((tile) => suitOf(tile) === suit)) {
      const ranks = new Array(10).fill(0)
      for (const tile of allTiles) ranks[rankOf(tile)]++
      const pure = ranks[1] >= 3 && ranks[9] >= 3 &&
        [2, 3, 4, 5, 6, 7, 8].every((rank) => ranks[rank] >= 1)
      if (pure) yakuman.push({ name: 'Chuuren Poutou', power: 1 })
    }
  }
  if (yakuman.length > 0) return { yakuman, menzen }

  // --- Normal yaku ---
  // Yakuhai
  for (const group of triplets) {
    if (isDragon(group.tile)) add('Yakuhai (dragon)', 1)
    if (group.tile === ctx.roundWind) add('Yakuhai (round wind)', 1)
    if (group.tile === ctx.seatWind) add('Yakuhai (seat wind)', 1)
  }
  // Shousangen
  if (dragonTriplets.length === 2 && isDragon(pair)) add('Shousangen', 2)

  // Tanyao
  if (allTiles.every((tile) => !isTerminalOrHonor(tile))) add('Tanyao', 1)

  // Pinfu
  if (menzen && runs.length === 4 && !isYakuhaiPair(pair, ctx) && placement.wait === 'ryanmen') {
    add('Pinfu', 1)
  }

  // Iipeikou / Ryanpeikou (closed only)
  if (menzen) {
    const runKey = (group) => group.tile
    const counts = {}
    for (const run of runs) counts[runKey(run)] = (counts[runKey(run)] || 0) + 1
    const doubles = Object.values(counts).filter((value) => value >= 2).length
    const quads = Object.values(counts).filter((value) => value >= 4).length // two identical pairs of runs
    if (doubles >= 2 || quads >= 1) add('Ryanpeikou', 3)
    else if (doubles === 1) add('Iipeikou', 1)
  }

  // Sanshoku doujun (three-colour straight)
  for (let lo = 1; lo <= 7; lo++) {
    const haveM = runs.some((run) => suitOf(run.tile) === 'm' && rankOf(run.tile) === lo)
    const haveP = runs.some((run) => suitOf(run.tile) === 'p' && rankOf(run.tile) === lo)
    const haveS = runs.some((run) => suitOf(run.tile) === 's' && rankOf(run.tile) === lo)
    if (haveM && haveP && haveS) { add('Sanshoku Doujun', menzen ? 2 : 1); break }
  }
  // Sanshoku doukou (three-colour triplets)
  for (let rank = 1; rank <= 9; rank++) {
    const haveM = triplets.some((group) => group.tile === `${rank}m`)
    const haveP = triplets.some((group) => group.tile === `${rank}p`)
    const haveS = triplets.some((group) => group.tile === `${rank}s`)
    if (haveM && haveP && haveS) { add('Sanshoku Doukou', 2); break }
  }
  // Ittsuu (pure straight)
  for (const suit of ['m', 'p', 's']) {
    const has1 = runs.some((run) => run.tile === `1${suit}`)
    const has4 = runs.some((run) => run.tile === `4${suit}`)
    const has7 = runs.some((run) => run.tile === `7${suit}`)
    if (has1 && has4 && has7) { add('Ittsuu', menzen ? 2 : 1); break }
  }

  // Toitoi
  if (triplets.length === 4) add('Toitoi', 2)
  // Sanankou (three concealed triplets)
  if (concealedTriplets.length === 3) add('Sanankou', 2)
  // Sankantsu
  if (groups.filter((group) => group.shape === 'kan').length === 3) add('Sankantsu', 2)

  // Honroutou (all terminals/honors)
  if (allTiles.every(isTerminalOrHonor)) add('Honroutou', 2)

  // Chanta / Junchan (every group + pair contains a terminal/honor)
  const groupHasYaochuu = (group) => groupTiles(group).some(isTerminalOrHonor)
  const allOutside = groups.every(groupHasYaochuu) && isTerminalOrHonor(pair)
  const hasRun = runs.length > 0
  if (allOutside && hasRun && !allTiles.every(isTerminalOrHonor)) {
    const hasHonor = allTiles.some(isHonor)
    if (hasHonor) add('Chanta', menzen ? 2 : 1)
    else add('Junchan', menzen ? 3 : 2)
  }

  // Flushes
  const suits = new Set(allTiles.filter((tile) => !isHonor(tile)).map(suitOf))
  const hasHonors = allTiles.some(isHonor)
  if (suits.size === 1) {
    if (!hasHonors) add('Chinitsu', menzen ? 6 : 5)
    else add('Honitsu', menzen ? 3 : 2)
  }

  return { yaku, allTiles }
}

// ---- Fu calculation (standard hands) --------------------------------------

function computeFu(placement, ctx, menzen, hasPinfu) {
  if (hasPinfu) return ctx.isTsumo ? 20 : 30
  let fu = 20
  if (menzen && !ctx.isTsumo) fu += 10 // menzen ron bonus
  if (ctx.isTsumo) fu += 2

  // pair
  if (isDragon(placement.pair)) fu += 2
  if (placement.pair === ctx.roundWind) fu += 2
  if (placement.pair === ctx.seatWind) fu += 2

  // triplets / kans
  placement.groups.forEach((group, idx) => {
    if (group.shape === 'run') return
    const terminalHonor = isTerminalOrHonor(group.tile)
    const concealed = effectivelyConcealed(group, idx, placement, ctx)
    if (group.shape === 'kan') {
      fu += concealed ? (terminalHonor ? 32 : 16) : (terminalHonor ? 16 : 8)
    } else {
      fu += concealed ? (terminalHonor ? 8 : 4) : (terminalHonor ? 4 : 2)
    }
  })
  // wait
  if (placement.wait === 'kanchan' || placement.wait === 'penchan' || placement.wait === 'tanki') fu += 2

  fu = Math.ceil(fu / 10) * 10
  if (!menzen && fu === 20) fu = 30 // open pinfu-shape (kuipinfu)
  return fu
}

// ---- Point calculation -----------------------------------------------------

const ceil100 = (value) => Math.ceil(value / 100) * 100

function pointsFromBase(base, isDealer, isTsumo) {
  if (isTsumo) {
    if (isDealer) {
      const each = ceil100(base * 2)
      return { tsumoEachNonDealer: each, total: each * 3, byDealerTsumo: true }
    }
    const fromDealer = ceil100(base * 2)
    const fromOthers = ceil100(base)
    return { tsumoFromDealer: fromDealer, tsumoFromNonDealer: fromOthers, total: fromDealer + fromOthers * 2 }
  }
  const ron = isDealer ? ceil100(base * 6) : ceil100(base * 4)
  return { ron, total: ron }
}

function limitBase(han, fu) {
  if (han >= 13) return { base: 8000, name: 'Yakuman (kazoe)' }
  if (han >= 11) return { base: 6000, name: 'Sanbaiman' }
  if (han >= 8) return { base: 4000, name: 'Baiman' }
  if (han >= 6) return { base: 3000, name: 'Haneman' }
  if (han === 5) return { base: 2000, name: 'Mangan' }
  let base = fu * Math.pow(2, 2 + han)
  if (base >= 2000) return { base: 2000, name: 'Mangan' }
  return { base, name: null }
}

// Count dora hits across all 14 tiles.
function countDora(allTiles, doraTiles) {
  let count = 0
  for (const tile of allTiles) {
    for (const dora of doraTiles) if (tile === dora) count++
  }
  return count
}

// Aka dora: one extra han per red five held, counted from the actual winning
// tiles (concealed hand + melds) rather than the normalized parse.
function countAka(ctx) {
  let count = ctx.concealed.filter(isRedFive).length
  for (const meld of ctx.melds) count += meld.tiles.filter(isRedFive).length
  return count
}

// Score a single parse, returning the best placement's result.
function scoreParse(parse, ctx) {
  if (parse.kind === 'kokushi') {
    return {
      yakuman: [{ name: parse.thirteenSided ? 'Kokushi (13-sided)' : 'Kokushi Musou', power: parse.thirteenSided ? 2 : 1 }],
      yaku: [], fu: 0, han: 0, isYakuman: true,
      allTiles: ctx.concealed.slice()
    }
  }
  if (parse.kind === 'chiitoi') {
    const yaku = [{ name: 'Chiitoitsu', han: 2 }]
    addCommonYaku(yaku, ctx, true)
    const allTiles = ctx.concealed.slice()
    // Honitsu / Chinitsu / Honroutou / Tsuuiisou on seven pairs
    const suits = new Set(allTiles.filter((tile) => !isHonor(tile)).map(suitOf))
    const hasHonors = allTiles.some(isHonor)
    if (allTiles.every(isHonor)) yaku.push({ name: 'Tsuuiisou', han: 0, yakuman: 1 })
    else if (suits.size === 1 && !hasHonors) yaku.push({ name: 'Chinitsu', han: 6 })
    else if (suits.size === 1) yaku.push({ name: 'Honitsu', han: 3 })
    if (allTiles.every((tile) => !isTerminalOrHonor(tile))) yaku.push({ name: 'Tanyao', han: 1 })
    if (allTiles.every(isTerminalOrHonor)) yaku.push({ name: 'Honroutou', han: 2 })
    return finalizeNormal(yaku, 25, ctx, allTiles, true)
  }

  // standard — menzen (closed) status depends only on *called* melds; an ankan
  // keeps the hand closed, and winning by ron never opens it.
  const menzen = ctx.melds.every((meld) => meld.concealed)
  let best = null
  for (const placement of buildPlacements(parse, ctx)) {
    const result = standardYaku(placement, ctx, menzen)
    if (result.yakuman) {
      const candidate = {
        isYakuman: true,
        yakuman: result.yakuman,
        allTiles: placement.groups.flatMap(groupTiles).concat([placement.pair, placement.pair])
      }
      if (!best || !best.isYakuman || power(candidate) > power(best)) best = candidate
      continue
    }
    const yaku = [...result.yaku]
    addCommonYaku(yaku, ctx, menzen)
    const hasPinfu = yaku.some((entry) => entry.name === 'Pinfu')
    const fu = computeFu(placement, ctx, menzen, hasPinfu)
    const allTiles = placement.groups.flatMap(groupTiles).concat([placement.pair, placement.pair])
    const candidate = finalizeNormal(yaku, fu, ctx, allTiles, menzen)
    if (!best || (!best.isYakuman && candidate.totalForCompare > best.totalForCompare)) {
      if (!(best && best.isYakuman)) best = candidate
    }
  }
  return best
}

const power = (result) => result.yakuman.reduce((sum, entry) => sum + entry.power, 0)

// Yaku that apply regardless of hand shape (riichi, tsumo, situational).
function addCommonYaku(yaku, ctx, menzen) {
  if (ctx.doubleRiichi) yaku.push({ name: 'Double Riichi', han: 2 })
  else if (ctx.riichi) yaku.push({ name: 'Riichi', han: 1 })
  if (ctx.ippatsu) yaku.push({ name: 'Ippatsu', han: 1 })
  if (ctx.isTsumo && menzen) yaku.push({ name: 'Menzen Tsumo', han: 1 })
  if (ctx.isHaitei) yaku.push({ name: 'Haitei', han: 1 })
  if (ctx.isHoutei) yaku.push({ name: 'Houtei', han: 1 })
  if (ctx.isRinshan) yaku.push({ name: 'Rinshan Kaihou', han: 1 })
  if (ctx.isChankan) yaku.push({ name: 'Chankan', han: 1 })
}

function finalizeNormal(yaku, fu, ctx, allTiles, menzen) {
  // Tenhou / Chiihou (blessing) override as yakuman.
  if (ctx.blessing) {
    return {
      isYakuman: true,
      yakuman: [{ name: ctx.blessing === 'tenhou' ? 'Tenhou' : 'Chiihou', power: 1 }],
      allTiles
    }
  }
  const embeddedYakuman = yaku.filter((entry) => entry.yakuman)
  if (embeddedYakuman.length > 0) {
    return { isYakuman: true, yakuman: embeddedYakuman.map((entry) => ({ name: entry.name, power: entry.yakuman })), allTiles }
  }
  const yakuHan = yaku.reduce((sum, entry) => sum + (entry.han || 0), 0)
  const dora = countDora(allTiles, ctx.doraTiles)
  const uraDora = ctx.riichi ? countDora(allTiles, ctx.uraDoraTiles) : 0
  const aka = countAka(ctx)
  const han = yakuHan + dora + uraDora + aka
  const fullYaku = [...yaku]
  if (dora > 0) fullYaku.push({ name: 'Dora', han: dora })
  if (uraDora > 0) fullYaku.push({ name: 'Ura Dora', han: uraDora })
  if (aka > 0) fullYaku.push({ name: 'Aka Dora', han: aka })
  return {
    isYakuman: false,
    hasYaku: yakuHan > 0, // dora alone is not a yaku
    yaku: fullYaku,
    fu, han,
    totalForCompare: han * 1000 + fu,
    allTiles
  }
}

// Public entry: score a complete winning hand.
// ctx: { concealed, melds, winningTile, isTsumo, seatWind, roundWind,
//        riichi, doubleRiichi, ippatsu, isHaitei, isHoutei, isRinshan,
//        isChankan, blessing, doraTiles, uraDoraTiles, isDealer, honba, riichiSticks }
export function scoreHand(ctx) {
  const parses = findAgari(ctx.concealed, ctx.melds, ctx.winningTile)
  if (parses.length === 0) return { valid: false, reason: 'Not a winning hand' }

  let best = null
  for (const parse of parses) {
    const result = scoreParse(parse, ctx)
    if (!result) continue
    if (!best) { best = result; continue }
    if (result.isYakuman && !best.isYakuman) { best = result; continue }
    if (result.isYakuman && best.isYakuman) {
      if (power(result) > power(best)) best = result
      continue
    }
    if (!result.isYakuman && !best.isYakuman && result.totalForCompare > best.totalForCompare) best = result
  }
  if (!best) return { valid: false, reason: 'Not a winning hand' }

  // Require at least one yaku (yakuman always qualifies).
  if (!best.isYakuman && !best.hasYaku) {
    return { valid: false, reason: 'No yaku' }
  }

  const isDealer = ctx.isDealer
  let base, han, fu, limitName, yaku
  if (best.isYakuman) {
    const totalPower = power(best)
    base = 8000 * totalPower
    han = 0; fu = 0
    limitName = totalPower > 1 ? `${totalPower}x Yakuman` : 'Yakuman'
    yaku = best.yakuman.map((entry) => ({ name: entry.name, han: 13 * entry.power }))
  } else {
    han = best.han; fu = best.fu
    const limit = limitBase(han, fu)
    base = limit.base
    limitName = limit.name
    yaku = best.yaku
  }

  const payment = pointsFromBase(base, isDealer, ctx.isTsumo)
  return {
    valid: true,
    isYakuman: best.isYakuman,
    han, fu, base, limitName, yaku,
    payment,
    isDealer,
    isTsumo: ctx.isTsumo
  }
}
