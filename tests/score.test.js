import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreHand } from '../src/game/score.js'
import { waitingTiles } from '../src/game/agari.js'

function yakuNames(result) {
  return result.yaku?.map((entry) => entry.name) ?? []
}

test('pinfu + tanyao ron', () => {
  const result = scoreHand({
    concealed: ['2m','3m','4m','5m','6m','7m','2p','3p','4p','6s','7s','8s','5p','5p'],
    melds: [], winningTile: '5m', isTsumo: false, seatWind: '1z', roundWind: '1z',
    riichi: false, doraTiles: [], uraDoraTiles: [], isDealer: false
  })
  assert.equal(result.valid, true)
  assert.equal(result.han, 2)
  assert.equal(result.fu, 30)
  assert.deepEqual(yakuNames(result), ['Tanyao', 'Pinfu'])
  assert.equal(result.payment.ron, 2000)
})

test('riichi tsumo pinfu', () => {
  const result = scoreHand({
    concealed: ['2m','3m','4m','5m','6m','7m','2p','3p','4p','6s','7s','8s','5p','5p'],
    melds: [], winningTile: '5m', isTsumo: true, seatWind: '1z', roundWind: '1z',
    riichi: true, doraTiles: [], uraDoraTiles: [], isDealer: false
  })
  assert.equal(result.han, 4)
  assert.equal(result.fu, 20)
  assert.deepEqual(yakuNames(result), ['Tanyao', 'Pinfu', 'Riichi', 'Menzen Tsumo'])
  assert.equal(result.payment.tsumoFromDealer, 2600)
  assert.equal(result.payment.tsumoFromNonDealer, 1300)
  assert.equal(result.payment.total, 5200)
})

test('suuankou tanki (ron on the pair) is double yakuman', () => {
  const result = scoreHand({
    concealed: ['5z','5z','5z','6z','6z','6z','1m','1m','1m','9p','9p','9p','5s','5s'],
    melds: [], winningTile: '5s', isTsumo: false, seatWind: '1z', roundWind: '1z',
    riichi: false, doraTiles: [], uraDoraTiles: [], isDealer: false
  })
  assert.equal(result.limitName, '2x Yakuman')
  assert.deepEqual(yakuNames(result), ['Suuankou'])
  assert.equal(result.payment.ron, 64000)
})

test('chiitoitsu riichi tsumo', () => {
  const result = scoreHand({
    concealed: ['1m','1m','3p','3p','5s','5s','1z','1z','5z','5z','9m','9m','7p','7p'],
    melds: [], winningTile: '7p', isTsumo: true, seatWind: '2z', roundWind: '1z',
    riichi: true, doraTiles: [], uraDoraTiles: [], isDealer: false
  })
  assert.equal(result.han, 4)
  assert.equal(result.fu, 25)
  assert.deepEqual(yakuNames(result), ['Chiitoitsu', 'Riichi', 'Menzen Tsumo'])
  assert.equal(result.payment.total, 6400)
})

test('kokushi 13-sided wait is double yakuman', () => {
  const result = scoreHand({
    concealed: ['1m','9m','1p','9p','1s','9s','1z','2z','3z','4z','5z','6z','7z','1m'],
    melds: [], winningTile: '1m', isTsumo: false, seatWind: '1z', roundWind: '1z',
    riichi: false, doraTiles: [], uraDoraTiles: [], isDealer: false
  })
  assert.equal(result.limitName, '2x Yakuman')
  assert.deepEqual(yakuNames(result), ['Kokushi (13-sided)'])
  assert.equal(result.payment.ron, 64000)
})

test('open hand with no yaku is invalid', () => {
  const result = scoreHand({
    concealed: ['2m','3m','4m','5p','6p','7p','2s','2s'],
    melds: [
      { type: 'chi', tiles: ['6m','7m','8m'], concealed: false },
      { type: 'pon', tiles: ['1p','1p','1p'], concealed: false }
    ],
    winningTile: '7p', isTsumo: false, seatWind: '1z', roundWind: '1z',
    riichi: false, doraTiles: [], uraDoraTiles: [], isDealer: false
  })
  assert.equal(result.valid, false)
  assert.equal(result.reason, 'No yaku')
})

test('two-sided wait reports both winning tiles', () => {
  const waits = waitingTiles(['2m','3m','4m','5m','6m','7m','2p','3p','4p','6s','7s','8s','5p'], [])
  assert.deepEqual(waits, ['2p', '5p'])
})
