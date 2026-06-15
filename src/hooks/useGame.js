import { useEffect, useRef, useState, useCallback } from 'react'
import { createConnection, selfId } from '../net/network.js'
import {
  createGame, startRound, applyAction, viewFor, nextRound
} from '../game/engine.js'
import { botTurnAction, botCallResponse } from '../game/bot.js'

const MAX_PLAYERS = 4
const clone = (value) => JSON.parse(JSON.stringify(value))

// How long a bot waits before acting, so its moves are watchable.
const BOT_DELAY = 5000

// Where the human players sit so they're spread as far apart as possible — with
// two humans they face each other (seats 0 and 2) and the bots take the sides.
const HUMAN_SEATS = { 1: [0], 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }

// Build the final length-4 seating from a lobby roster: humans spread out per
// HUMAN_SEATS (host kept at seat 0), every remaining seat filled by a bot.
function buildSeating(roster) {
  const humans = roster.filter((player) => !player.bot)
  // Keep the host at the front so it lands on seat 0 (a stable, familiar anchor).
  humans.sort((left, right) => (left.id === selfId ? -1 : right.id === selfId ? 1 : 0))
  const seats = new Array(MAX_PLAYERS).fill(null)
  const placement = HUMAN_SEATS[humans.length] || [0, 1, 2, 3]
  humans.forEach((player, idx) => { seats[placement[idx]] = player })
  let botNumber = 1
  for (let seat = 0; seat < MAX_PLAYERS; seat++) {
    if (!seats[seat]) seats[seat] = { id: `bot-${seat}`, name: `Bot ${botNumber++}`, bot: true }
  }
  return seats
}

// Host election: every peer that enters a room is initially 'electing'. After a
// short settle window each peer either becomes the host (it heard no existing
// host and ranks first) or a client of the elected host. This removes the manual
// create/join split — whoever gets there first ends up running the game.
const ELECTION_WINDOW = 1200 // ms to wait before settling on a host
const CLAIM_RETRY = 400 //      ms between claim re-announcements while electing
const LOBBY_HEARTBEAT = 1500 // ms between host claim re-asserts / client re-hellos

// Connection-feedback timeouts (ms from mount).
const RELAY_TIMEOUT = 12000
const PEER_TIMEOUT = 22000
const HOST_TIMEOUT = 16000

// Drives the whole multiplayer session. The elected host instance owns the
// engine and broadcasts per-player views; client instances just render the views
// they receive and forward action intents to the host.
export function useGame({ roomId, name }) {
  const [view, setView] = useState(null)
  const [roster, setRoster] = useState([]) // [{ id, name }] indexed by seat
  const [chat, setChat] = useState([])
  const [emotes, setEmotes] = useState({}) // { [seat]: { emoji, id } } transient reactions
  const [role, setRole] = useState('electing') // 'electing' | 'host' | 'client'
  const [status, setStatus] = useState('connecting')
  const [akaDora, setAkaDora] = useState(true) // host's red-fives toggle (default on)
  // Connection / error feedback surfaced to the UI.
  const [net, setNet] = useState({ peers: 0, relayOpen: 0, relayTotal: 0, reachedHost: false })
  const [warning, setWarning] = useState(null) // non-fatal connection guidance
  const [error, setError] = useState(null) // dismissible error message

  const connRef = useRef(null)
  const gameRef = useRef(null) // host only: authoritative engine state
  const rosterRef = useRef([]) // host only
  const hostIdRef = useRef(null) // client only: the elected host's id
  const isHostRef = useRef(false)
  const roleRef = useRef('electing')
  const reachedHostRef = useRef(false)
  const viewRef = useRef(null)
  viewRef.current = view // latest view, for reading own seat in callbacks
  const botTimerRef = useRef(null) // host only: pending bot move
  const runBotsRef = useRef(() => {}) // host only: bot-driver, set below

  const setRoleSafe = useCallback((next) => {
    roleRef.current = next
    setRole(next)
  }, [])

  // Show an emoji reaction bubbling from a seat; it clears itself after 5s.
  const showEmote = useCallback((seat, emoji) => {
    const id = Date.now() + Math.random()
    setEmotes((prev) => ({ ...prev, [seat]: { emoji, id } }))
    setTimeout(() => {
      setEmotes((prev) => (prev[seat]?.id === id ? { ...prev, [seat]: null } : prev))
    }, 5000)
  }, [])

  const fail = useCallback((context, err) => {
    // Surface any engine/transport error instead of swallowing it.
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, err)
    setError(`${context}: ${err?.message || err}`)
  }, [])

  // ---- host helpers ----
  const broadcast = useCallback(() => {
    const conn = connRef.current
    const game = gameRef.current
    if (!conn || !game) return
    try {
      for (const player of rosterRef.current) {
        // Bots have no peer to receive a view; they're driven straight from state.
        if (player.bot) continue
        const personalized = viewFor(game, player.id)
        if (player.id === selfId) setView(clone(personalized))
        else conn.sendView(clone(personalized), player.id)
      }
    } catch (err) {
      fail('Broadcast failed', err)
    }
    // After every state change, let any bot whose turn (or call) it is act.
    runBotsRef.current()
  }, [fail])

  const broadcastRoster = useCallback(() => {
    const conn = connRef.current
    if (!conn) return
    conn.sendRoster({ players: rosterRef.current, hostId: selfId })
    setRoster(rosterRef.current.slice())
  }, [])

  const startGame = useCallback(() => {
    if (!isHostRef.current || gameRef.current) return
    try {
      // Seat the humans (spread apart) and fill the empty seats with bots.
      const seating = buildSeating(rosterRef.current)
      rosterRef.current = seating
      setRoster(seating.slice())
      const players = seating.map((player) => ({ id: player.id, name: player.name }))
      const game = startRound(createGame(players, { aka: akaDora }))
      gameRef.current = game
      connRef.current.sendStart({ players: seating })
      broadcast()
    } catch (err) {
      fail('Failed to start game', err)
    }
  }, [broadcast, fail, akaDora])

  const goNextRound = useCallback(() => {
    if (!isHostRef.current || !gameRef.current) return
    try {
      gameRef.current = nextRound(gameRef.current)
      broadcast()
    } catch (err) {
      fail('Failed to advance round', err)
    }
  }, [broadcast, fail])

  // ---- bot driver (host only) ----
  // Inspect the authoritative state and, if the seat that must act next is a bot
  // (its turn to discard, or a pending call it must answer), schedule that move
  // after a short delay. Applying it broadcasts, which calls back in here for the
  // following bot move — so one scheduled timer chains the whole bot sequence.
  const runBots = useCallback(() => {
    if (!isHostRef.current) return
    const game = gameRef.current
    if (!game || game.phase !== 'playing') return
    const roster = rosterRef.current

    let pending = null
    if (game.state === 'discard' && roster[game.turn]?.bot) {
      pending = { seat: game.turn, kind: 'turn' }
    } else if (game.state === 'callWait' && game.pendingCalls) {
      for (const [seatStr, entry] of Object.entries(game.pendingCalls)) {
        const seat = Number(seatStr)
        if (!entry.responded && roster[seat]?.bot) { pending = { seat, kind: 'call' }; break }
      }
    }
    if (!pending) return

    clearTimeout(botTimerRef.current)
    botTimerRef.current = setTimeout(() => {
      const current = gameRef.current
      if (!current || current.phase !== 'playing') return
      try {
        let action
        if (pending.kind === 'turn') {
          if (current.state !== 'discard' || current.turn !== pending.seat) { runBotsRef.current(); return }
          action = botTurnAction(current, pending.seat)
        } else {
          const entry = current.pendingCalls?.[pending.seat]
          if (!entry || entry.responded) { runBotsRef.current(); return }
          action = { type: 'callResponse', response: botCallResponse(entry.options) }
        }
        gameRef.current = applyAction(current, pending.seat, action)
        broadcast()
      } catch (err) {
        fail('Bot action failed', err)
      }
    }, BOT_DELAY)
  }, [broadcast, fail])
  runBotsRef.current = runBots

  // ---- action dispatch (works for host and clients) ----
  const sendAction = useCallback((action) => {
    const conn = connRef.current
    if (!conn) return
    if (isHostRef.current) {
      const game = gameRef.current
      if (!game) return
      try {
        const seat = rosterRef.current.findIndex((player) => player.id === selfId)
        gameRef.current = applyAction(game, seat, action)
        broadcast()
      } catch (err) {
        fail('Action failed', err)
      }
    } else {
      conn.sendAct({ action }, hostIdRef.current || undefined)
    }
  }, [broadcast, fail])

  const sendChat = useCallback((text) => {
    const conn = connRef.current
    if (!conn || !text.trim()) return
    const entry = { from: name, text: text.trim(), at: Date.now() }
    conn.sendChat(entry)
    setChat((prev) => [...prev, entry])
  }, [name])

  const sendEmote = useCallback((emoji) => {
    const conn = connRef.current
    const seat = viewRef.current?.you
    if (!conn || seat == null) return
    conn.sendEmote({ seat, emoji })
    showEmote(seat, emoji)
  }, [showEmote])

  const dismissError = useCallback(() => setError(null), [])

  useEffect(() => {
    // Known claims from other peers, keyed by peerId.
    const claims = new Map()
    // Our own claim; `established` flips true once we decide we're the host.
    const myClaim = { established: false, rosterSize: 0 }

    let conn

    // Re-announce our current claim so newcomers (and rival hosts) learn our
    // role and, if we're host, how populated our lobby is.
    const sendMyClaim = () => {
      myClaim.established = isHostRef.current
      myClaim.rosterSize = isHostRef.current ? rosterRef.current.length : 0
      connRef.current?.sendClaim(myClaim)
    }

    // Pick the best established host we've heard of: the most-populated lobby,
    // ties broken by lowest id (a stable, agreed-upon ordering).
    const pickBestEstablished = () => {
      let best = null
      for (const entry of claims.values()) {
        if (!entry.established) continue
        if (!best ||
            entry.rosterSize > best.rosterSize ||
            (entry.rosterSize === best.rosterSize && entry.id < best.id)) {
          best = entry
        }
      }
      return best
    }

    const becomeHost = () => {
      isHostRef.current = true
      setRoleSafe('host')
      rosterRef.current = [{ id: selfId, name }]
      setRoster(rosterRef.current.slice())
      setStatus('lobby')
      sendMyClaim()
      broadcastRoster()
    }

    const becomeClient = (hostId) => {
      isHostRef.current = false
      gameRef.current = null
      rosterRef.current = []
      hostIdRef.current = hostId
      reachedHostRef.current = false
      setRoleSafe('client')
      setStatus('connecting')
      connRef.current?.sendHello({ name })
    }

    // A rival host outranks us — step aside, but never abandon players who have
    // already joined us and never mid-game (the engine can't be handed off).
    const stepDownTo = (hostId) => {
      if (gameRef.current) return
      if (rosterRef.current.length > 1) return
      becomeClient(hostId)
    }

    // After the settle window: defer to any established host, else the lowest id
    // among everyone we've heard from becomes the host.
    const decide = () => {
      if (roleRef.current !== 'electing') return
      const established = pickBestEstablished()
      if (established) { becomeClient(established.id); return }
      let lowest = selfId
      for (const entry of claims.values()) if (entry.id < lowest) lowest = entry.id
      if (lowest === selfId) becomeHost()
      else becomeClient(lowest)
    }

    try {
      conn = createConnection({
        roomId,
        onPeerJoin: () => {
          // Tell the newcomer who we are; if we host, also (re)send the roster.
          sendMyClaim()
          if (isHostRef.current && !gameRef.current) broadcastRoster()
        },
        onPeerLeave: (peerId) => {
          claims.delete(peerId)
          if (!isHostRef.current) return
          const game = gameRef.current
          if (game) {
            // Mid-game: hand the departed player's seat to a bot rather than
            // stalling the round (the engine can't drop a seat).
            const seat = game.players.findIndex((player) => player.id === peerId)
            if (seat >= 0 && !rosterRef.current[seat]?.bot) {
              rosterRef.current = rosterRef.current.map((player, idx) =>
                (idx === seat ? { ...player, bot: true } : player))
              // Reflect the takeover in the name everyone sees.
              game.players[seat] = { ...game.players[seat], name: `${game.players[seat].name} (AI)` }
              broadcastRoster()
              broadcast() // re-send the renamed roster's views and wake the bot driver
            }
          } else {
            rosterRef.current = rosterRef.current.filter((player) => player.id !== peerId)
            broadcastRoster()
          }
        }
      })
    } catch (err) {
      fail('Could not join room', err)
      return undefined
    }
    connRef.current = conn

    // ---- host election ----
    conn.onClaim((data, peerId) => {
      claims.set(peerId, { id: peerId, established: !!data.established, rosterSize: data.rosterSize || 0 })
      const current = roleRef.current
      if (current === 'electing') {
        if (data.established) becomeClient((pickBestEstablished() || { id: peerId }).id)
        return
      }
      if (current === 'host') {
        if (data.established) {
          // Another host exists; the bigger lobby wins, ties by lowest id.
          const mySize = rosterRef.current.length
          const otherSize = data.rosterSize || 0
          const otherWins = otherSize > mySize || (otherSize === mySize && peerId < selfId)
          if (otherWins) stepDownTo(peerId)
          else sendMyClaim()
        } else {
          // A newcomer announced itself — assert that we're the host so it defers.
          sendMyClaim()
          if (!gameRef.current) broadcastRoster()
        }
        return
      }
      // We're a client: switch to a better-ranked established host if one appears.
      if (data.established) {
        const curr = claims.get(hostIdRef.current)
        const currSize = curr?.rosterSize || 0
        const otherSize = data.rosterSize || 0
        const better = otherSize > currSize || (otherSize === currSize && peerId < (hostIdRef.current || ''))
        if (better && peerId !== hostIdRef.current) {
          hostIdRef.current = peerId
          reachedHostRef.current = false
          conn.sendHello({ name })
        }
      }
    })

    // ---- host-side handlers (act only while we are the host) ----
    conn.onHello((data, peerId) => {
      if (!isHostRef.current || gameRef.current) return
      if (rosterRef.current.some((player) => player.id === peerId)) return
      if (rosterRef.current.length >= MAX_PLAYERS) return
      rosterRef.current = [...rosterRef.current, { id: peerId, name: data.name || 'Player' }]
      broadcastRoster()
      sendMyClaim() // our lobby grew — re-assert so rival hosts defer
    })

    conn.onAct((data, peerId) => {
      if (!isHostRef.current) return
      const game = gameRef.current
      if (!game) return
      try {
        const seat = rosterRef.current.findIndex((player) => player.id === peerId)
        if (seat < 0) return
        gameRef.current = applyAction(game, seat, data.action)
        broadcast()
      } catch (err) {
        fail('Action from a peer failed', err)
      }
    })

    // ---- client-side handlers (ignored while we are the host) ----
    conn.onRoster((data) => {
      if (isHostRef.current) return
      hostIdRef.current = data.hostId
      reachedHostRef.current = true
      setNet((prev) => ({ ...prev, reachedHost: true }))
      setRoster(data.players)
      setStatus((prev) => (prev === 'connecting' ? 'lobby' : prev))
    })
    conn.onStart(() => { if (!isHostRef.current) setStatus('playing') })
    conn.onView((data) => {
      if (isHostRef.current) return
      reachedHostRef.current = true
      setView(data)
      setStatus('playing')
    })

    conn.onChat((entry) => setChat((prev) => [...prev, entry]))
    conn.onEmote((data) => { if (data && data.emoji != null) showEmote(data.seat, data.emoji) })

    // Kick off the election: announce, re-announce while electing, then settle.
    sendMyClaim()
    const claimRetry = setInterval(() => {
      if (roleRef.current === 'electing') sendMyClaim()
      else clearInterval(claimRetry)
    }, CLAIM_RETRY)
    const settleTimer = setTimeout(decide, ELECTION_WINDOW)

    // Lobby heartbeat: host keeps asserting its claim so peers converge on it;
    // a client that hasn't reached its host keeps re-introducing itself.
    const heartbeat = setInterval(() => {
      if (isHostRef.current) {
        if (!gameRef.current) sendMyClaim()
      } else if (roleRef.current === 'client' && !reachedHostRef.current) {
        conn.sendHello({ name })
      }
    }, LOBBY_HEARTBEAT)

    // Connection-health monitor: peer count, relay health, and
    // time-based warnings so the user isn't left staring at a silent screen.
    const startedAt = Date.now()
    const monitor = setInterval(() => {
      const peers = conn.getPeers().length
      const { open, total } = conn.getRelayHealth()
      setNet((prev) => ({ ...prev, peers, relayOpen: open, relayTotal: total }))

      const elapsed = Date.now() - startedAt
      let nextWarning = null
      // These are lobby/matchmaking warnings; once a game is underway they no
      // longer apply (a solo game filled with bots legitimately has no peers).
      if (viewRef.current) {
        nextWarning = null
      } else if (total > 0 && open === 0 && elapsed > RELAY_TIMEOUT) {
        nextWarning = 'Can’t reach any matchmaking relay. Check your network/VPN/firewall.'
      } else if (peers === 0 && elapsed > PEER_TIMEOUT) {
        nextWarning = 'No other players found yet. Everyone must use the exact same room code — and stay on this screen.'
      } else if (roleRef.current === 'client' && !reachedHostRef.current && peers > 0 && elapsed > HOST_TIMEOUT) {
        nextWarning = 'Connected to a peer, but the host hasn’t responded. Is the host still in this room?'
      }
      setWarning(nextWarning)
    }, 2000)

    // Surface otherwise-invisible async failures (e.g. transport send rejections).
    const onRejection = (event) => {
      const reason = event.reason
      if (reason && /trystero|relay|webrtc|datachannel|socket/i.test(String(reason?.message || reason))) {
        setError(`Network error: ${reason.message || reason}`)
      }
    }
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      clearInterval(claimRetry)
      clearTimeout(settleTimer)
      clearInterval(heartbeat)
      clearInterval(monitor)
      clearTimeout(botTimerRef.current)
      try { conn.leave() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name])

  // The host can start at any time; empty seats are filled with bots.
  const canStart = role === 'host' && !gameRef.current && roster.length >= 1

  return {
    view,
    roster,
    chat,
    emotes,
    status,
    role,
    isHost: role === 'host',
    selfId,
    canStart,
    akaDora,
    setAkaDora,
    net,
    warning,
    error,
    dismissError,
    sendAction,
    startGame,
    goNextRound,
    sendChat,
    sendEmote
  }
}
