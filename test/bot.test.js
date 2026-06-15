import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, startRound, applyAction, nextRound } from '../src/game/engine.js'
import { botTurnAction, botCallResponse, chooseDiscard } from '../src/game/bot.js'

// Reproduce the host's bot driver (see useGame.js runBots) outside React: keep
// applying the next bot decision until the round ends. The invariant is that
// four bots can play full rounds — every turn and every call resolves to a legal
// action and the round always reaches a terminal state (never stalls).
test('four bots play full rounds to completion without stalling', () => {
  const GAMES = 200
  let wins = 0
  let draws = 0

  for (let game = 0; game < GAMES; game++) {
    let state = startRound(createGame([
      { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }
    ], { aka: game % 2 === 0 }))

    let steps = 0
    while (state.phase === 'playing' && steps < 2000) {
      steps++
      if (state.state === 'discard') {
        const seat = state.turn
        state = applyAction(state, seat, botTurnAction(state, seat))
      } else if (state.state === 'callWait') {
        const entry = Object.entries(state.pendingCalls).find(([, value]) => !value.responded)
        if (!entry) break
        const seat = Number(entry[0])
        state = applyAction(state, seat, { type: 'callResponse', response: botCallResponse(entry[1].options) })
      } else break
    }

    // An illegal bot action would leave the state unchanged and loop until the
    // step cap, so the round still being 'playing' here flags a stall or a bad move.
    assert.notEqual(state.phase, 'playing', `game ${game} stalled at step ${steps} (state ${state.state})`)
    if (state.result?.type === 'win') wins++
    else if (state.result?.type === 'draw') draws++
    nextRound(state)
  }

  assert.equal(wins + draws, GAMES)
  // Efficiency-driven bots should win a healthy share of rounds, not just draw.
  assert.ok(wins > GAMES * 0.3, `expected bots to win often, got ${wins}/${GAMES} wins`)
})

// The discard picker must always return a tile that's actually in the hand.
test('chooseDiscard returns a held tile', () => {
  const hand = ['1m', '1m', '2m', '3m', '5p', '6p', '7p', '2s', '3s', '4s', '8s', '8s', '9p', '7z']
  for (let trial = 0; trial < 50; trial++) {
    const tile = chooseDiscard(hand, [])
    assert.ok(hand.includes(tile), `chooseDiscard returned ${tile}, not in hand`)
  }
})
