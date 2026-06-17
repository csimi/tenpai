// Thin transport wrapper over @trystero-p2p/nostr (Nostr-relay matchmaking).
//
// We use a host-authoritative topology: every peer connects to the same room,
// and one peer becomes the host that runs the game engine. There is no manual
// "create vs join" — peers elect a host in the lobby (see useGame.js) by
// exchanging `claim` messages; the rest send action intents to that host and
// receive personalized state views back. This module only moves messages.
//
// Matchmaking runs over the package's default public Nostr relays. Trystero
// connects to several in parallel and only needs ONE to succeed, so a console
// warning like "WebSocket connection to 'wss://…' failed" for an individual
// relay is expected and non-fatal — peers still pair through the others.

import { joinRoom, getRelaySockets } from '@trystero-p2p/nostr'
import { selfId } from '@trystero-p2p/core'

const APP_ID = 'tenpai-p2p-v1'

export { selfId }

// Action namespaces. Kept short and stable.
const NS = {
  claim: 'clam', // any -> all: host-election claim { established, rosterSize, hostId }
  hello: 'hello', // client -> host: announce name (and re-announce on reconnect)
  roster: 'rost', // host -> all: lobby roster + assigned seats
  view: 'view', //  host -> one: personalized game-state view
  act: 'act', //    client -> host: an action intent
  start: 'strt', //  host -> all: game starting
  reset: 'rset', //  host -> all: match over, return to the lobby
  chat: 'chat', //   any -> all: chat message
  emote: 'emot' //   any -> all: emoji reaction { seat, emoji }
}

// Create a connected room. `handlers` are callbacks the orchestrator supplies.
export function createConnection({ roomId, onPeerJoin, onPeerLeave }) {
  const room = joinRoom({ appId: APP_ID }, roomId)

  const claim = room.makeAction(NS.claim)
  const hello = room.makeAction(NS.hello)
  const roster = room.makeAction(NS.roster)
  const view = room.makeAction(NS.view)
  const act = room.makeAction(NS.act)
  const start = room.makeAction(NS.start)
  const reset = room.makeAction(NS.reset)
  const chat = room.makeAction(NS.chat)
  const emote = room.makeAction(NS.emote)

  room.onPeerJoin = (peerId) => onPeerJoin && onPeerJoin(peerId)
  room.onPeerLeave = (peerId) => onPeerLeave && onPeerLeave(peerId)

  return {
    selfId,
    room,

    // ---- sending ----
    sendClaim: (payload) => claim.send(payload),
    sendHello: (payload) => hello.send(payload),
    sendRoster: (payload, target) => roster.send(payload, target ? { target } : undefined),
    sendView: (payload, target) => view.send(payload, { target }),
    sendAct: (payload, target) => act.send(payload, target ? { target } : undefined),
    sendStart: (payload) => start.send(payload),
    sendReset: (payload) => reset.send(payload || {}),
    sendChat: (payload) => chat.send(payload),
    sendEmote: (payload) => emote.send(payload),

    // ---- receiving (assign a handler) ----
    onClaim: (handler) => { claim.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onHello: (handler) => { hello.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onRoster: (handler) => { roster.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onView: (handler) => { view.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onAct: (handler) => { act.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onStart: (handler) => { start.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onReset: (handler) => { reset.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onChat: (handler) => { chat.onMessage = (data, ctx) => handler(data, ctx.peerId) },
    onEmote: (handler) => { emote.onMessage = (data, ctx) => handler(data, ctx.peerId) },

    getPeers: () => Object.keys(room.getPeers()),

    // Relay health: how many of the matchmaking relays are currently OPEN.
    getRelayHealth: () => {
      let open = 0
      let total = 0
      try {
        const sockets = getRelaySockets() || {}
        for (const socket of Object.values(sockets)) {
          total++
          // socket may be a raw WebSocket or a wrapper exposing readyState
          const readyState = socket?.readyState ?? socket?.socket?.readyState
          if (readyState === 1) open++
        }
      } catch {
        // introspection unavailable; report unknown
      }
      return { open, total }
    },

    leave: () => room.leave()
  }
}
