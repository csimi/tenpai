import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, startRound, applyAction, viewFor, nextRound, beginTurn } from '../src/game/engine.js'

const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]

function yakuNames(state) {
  return state.result?.wins?.[0]?.yaku?.map((entry) => entry.name) ?? []
}

test('dealer first-draw tsumo wins (tenhou) and reveals ura-dora', () => {
  let state = startRound(createGame(players))
  // Hand-craft the dealer (seat0) into a clean tenpai, then force the winning draw.
  // Because it is the dealer's very first draw with no prior calls, this is tenhou.
  state.hands[0] = ['2m','3m','4m','5m','6m','7m','2p','3p','4p','6s','7s','8s','5p']
  state.melds[0] = []
  state.turn = 0; state.state = 'discard'; state.drawnTile = '5p'; state.drawnFrom = 'wall'
  state.hands[0] = [...state.hands[0], '5p']
  state.riichi = [true, false, false, false]; state.ippatsu = [true, false, false, false]
  state = applyAction(state, 0, { type: 'tsumo' })

  assert.equal(state.phase, 'roundEnd')
  assert.equal(state.result.type, 'win')
  assert.ok(yakuNames(state).includes('Tenhou'))
  assert.deepEqual(state.result.deltas, [48000, -16000, -16000, -16000])

  // ura-dora is withheld in views until round end; it should now be revealed.
  const view = viewFor(state, 'b')
  assert.equal(view.phase, 'roundEnd')
  assert.ok(view.uraDoraIndicators)

  // dealer keeps the box on a win, honba increments.
  const next = nextRound(state)
  assert.equal(next.phase, 'playing')
  assert.equal(next.dealer, 0)
  assert.equal(next.honba, 1)
})

test('ron is offered on a discard and scores tanyao + dora', () => {
  let state = startRound(createGame(players))
  // Pin the dora indicator (→ dora 2z, absent from the hand) so the deal is
  // deterministic; otherwise a randomly-dealt dora inflates the score.
  state.doraIndicators = ['1z']
  // seat2 tenpai on a tanyao shape waiting 5p; seat1 discards 5p into it.
  state.hands[2] = ['2m','3m','4m','5m','6m','7m','2p','3p','4p','6s','7s','8s','5p']
  state.melds[2] = []
  // Pin the other seats to honour junk that can never ron 5p, so only seat 2 is
  // offered the call (otherwise a randomly-dealt seat could also be tenpai on 5p).
  state.hands[0] = ['1z','1z','2z','2z','3z','3z','4z','4z','5z','5z','6z','6z','7z']
  state.hands[3] = ['1z','1z','2z','2z','3z','3z','4z','4z','5z','5z','6z','6z','7z']
  state.furiten = [false, false, false, false]
  state.tempFuriten = [false, false, false, false]
  state.riichi = [false, false, false, false]
  state.turn = 1; state.state = 'discard'; state.drawnTile = '5p'
  state.hands[1] = [...state.hands[1].slice(0, 13)]
  state.hands[1].push('5p')
  if (!state.hands[1].includes('5p')) state.hands[1][0] = '5p'
  state = applyAction(state, 1, { type: 'discard', tile: '5p' })

  assert.equal(state.state, 'callWait')
  assert.deepEqual(Object.keys(state.pendingCalls), ['2'])

  state = applyAction(state, 2, { type: 'callResponse', response: { type: 'ron' } })
  if (state.pendingCalls) {
    for (const seat of Object.keys(state.pendingCalls)) {
      state = applyAction(state, Number(seat), { type: 'callResponse', response: { type: 'pass' } })
    }
  }

  assert.equal(state.phase, 'roundEnd')
  assert.equal(state.result.type, 'win')
  assert.deepEqual(state.result.deltas, [0, -1300, 1300, 0])
  assert.deepEqual(yakuNames(state), ['Tanyao'])
})

test('match reaches game end via repeated exhaustive draws', () => {
  let state = startRound(createGame(players))
  let guard = 0
  while (state.phase !== 'gameEnd' && guard < 50) {
    guard++
    state.wall = [] // empty the wall so the next turn triggers an exhaustive draw
    state = beginTurn(state)
    if (state.phase === 'roundEnd') {
      state = nextRound(state)
    }
  }
  assert.equal(state.phase, 'gameEnd')
  assert.ok(guard < 50)
})

test('game over keeps the final round label and result for the standings dialog', () => {
  // Force an East-only match to its end: simulate finishing East 4 with the
  // dealer (seat3) not keeping, so nextRound should declare the game over rather
  // than rolling into a phantom South 1.
  let state = startRound(createGame(players))
  state.dealer = 3
  state.roundWind = '1z'
  state.roundNumber = 4
  // Pretend the round just ended in an exhaustive draw the dealer didn't keep.
  state.phase = 'roundEnd'
  state.state = 'over'
  state.result = { type: 'draw', tenpai: [false, false, false, false], deltas: [0, 0, 0, 0], hands: [null, null, null, null], doraIndicators: state.doraIndicators }
  state._dealerKeepsByTenpai = false

  const ended = nextRound(state)
  assert.equal(ended.phase, 'gameEnd', 'tonpuusen ends after East 4')
  assert.equal(ended.roundWind, '1z', 'keeps the East wind, not a phantom South')
  assert.equal(ended.roundNumber, 4, 'keeps the last round number')
  assert.ok(ended.result, 'preserves the result so the game-over dialog can open')

  // The per-player view a client/host renders must carry the result through too.
  const view = viewFor(ended, 'a')
  assert.equal(view.phase, 'gameEnd')
  assert.ok(view.result, 'view exposes the final result')
})

test('all-winds match runs East through North, then ends', () => {
  let state = startRound(createGame(players, { maxRoundWind: '4z' }))
  const played = []
  for (let guard = 0; guard < 30 && state.phase === 'playing'; guard++) {
    played.push(`${state.roundWind}${state.roundNumber}`)
    // Force a no-tenpai exhaustive draw the dealer doesn't keep, so the dealer
    // rotates every round and the match marches through all four winds.
    state.phase = 'roundEnd'
    state.state = 'over'
    state.result = { type: 'draw', tenpai: [false, false, false, false], deltas: [0, 0, 0, 0], hands: [null, null, null, null], doraIndicators: state.doraIndicators }
    state._dealerKeepsByTenpai = false
    state = nextRound(state)
  }
  assert.equal(state.phase, 'gameEnd', 'four-wind match ends after North')
  assert.equal(state.roundWind, '4z')
  assert.equal(state.roundNumber, 4)
  assert.deepEqual([played[0], played[15]], ['1z1', '4z4'])
  assert.equal(played.length, 16, 'exactly 16 rounds (East 1 … North 4) are played')
})
