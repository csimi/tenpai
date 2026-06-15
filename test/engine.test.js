import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGame, startRound, applyAction, viewFor, nextRound, selfOptions } from '../src/game/engine.js'

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Drives many full rounds with randomized-but-legal play. The invariant under test
// is that the engine never throws and every round reaches a terminal state — i.e.
// no illegal-action crash and no game gets stuck mid-round.
test('randomized full-round simulation never throws or stalls', () => {
  const GAMES = 300
  let rounds = 0, wins = 0, draws = 0

  for (let game = 0; game < GAMES; game++) {
    // Run half the games with red fives (akadora) so those engine paths — red
    // tiles flowing through draws, calls, kans and wins — are exercised too.
    let state = startRound(createGame([
      { id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }
    ], { aka: game % 2 === 0 }))
    let steps = 0
    while (state.phase === 'playing' && steps < 2000) {
      steps++
      if (state.state === 'discard') {
        const seat = state.turn
        const opts = selfOptions(state, seat)
        if (opts.tsumo && Math.random() < 0.9) { state = applyAction(state, seat, { type: 'tsumo' }); continue }
        if (opts.kan && Math.random() < 0.1) { state = applyAction(state, seat, { type: 'kan', ...randomPick(opts.kan) }); continue }
        const hand = state.hands[seat]
        let tile = Math.random() < 0.5 && state.drawnTile ? state.drawnTile : randomPick(hand)
        if (opts.riichi && Math.random() < 0.3) { tile = randomPick(opts.riichi); state = applyAction(state, seat, { type: 'riichi', tile }); continue }
        state = applyAction(state, seat, { type: 'discard', tile })
      } else if (state.state === 'callWait') {
        const calls = state.pendingCalls
        if (!calls) continue
        for (const [seatStr, entry] of Object.entries(calls)) {
          if (entry.responded) continue
          const seat = Number(seatStr)
          const options = entry.options
          let resp = { type: 'pass' }
          if (options.ron && Math.random() < 0.8) resp = { type: 'ron' }
          else if (options.pon && Math.random() < 0.15) resp = { type: 'pon' }
          else if (options.chi && Math.random() < 0.15) resp = { type: 'chi', tiles: randomPick(options.chi) }
          state = applyAction(state, seat, { type: 'callResponse', response: resp })
          if (state.state !== 'callWait') break
        }
      } else break
    }

    assert.notEqual(state.phase, 'playing', `game ${game} stalled at step ${steps} (phase ${state.phase}, state ${state.state})`)
    rounds++
    if (state.result?.type === 'win') wins++
    else if (state.result?.type === 'draw') draws++
    // exercise per-player views and round advancement on the terminal state.
    viewFor(state, 'a'); viewFor(state, 'b')
    nextRound(state)
  }

  assert.equal(rounds, GAMES)
  assert.equal(wins + draws, rounds)
})
