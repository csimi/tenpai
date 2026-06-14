# Tenpai — serverless P2P riichi mahjong

A 4-player Japanese riichi mahjong game that runs entirely in the browser with
**no game server**. Players connect peer-to-peer via WebRTC, matchmade over
Nostr relays using [`@trystero-p2p`](https://www.npmjs.com/package/@trystero-p2p/core).

Built with **React + Material UI + Vite** (plain JavaScript).

**▶ Play it: https://csimi.github.io/tenpai/**

## Running

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm test         # run the engine / scoring test suites
```

To play, open the app on **four browser tabs/devices**:

1. Everyone enters the **same room code** — there's no separate create/join step.
2. The peers automatically **elect a host** (see below); once all four are in the
   lobby, the host presses **Start game**.

All four tabs must stay open. The elected host runs the authoritative game engine;
once the game starts the host is fixed, and if the host leaves, the game ends.

## How the networking works

The topology is **host-authoritative** over a symmetric P2P mesh:

- Every peer joins the same Trystero room (Nostr strategy, `@trystero-p2p/nostr`).
- **Host election (lobby only):** each peer starts out `electing` and announces a
  `claim`. After a short settle window (~1.2s) it either becomes the host — if it
  heard no established host and ranks first by id — or becomes a client of the
  elected host; newcomers always defer to an established host. Once a game starts
  the host is fixed and can't be handed off.
- The elected host owns the single source of truth (`GameState`) and runs the
  entire rules engine.
- Clients send **action intents** (`discard`, `riichi`, `tsumo`, `pon`, …) to the host.
- The host validates each action, advances the engine, and broadcasts a
  **per-player sanitized view** to each peer — other players' concealed hands, the
  live wall, and the ura-dora are hidden until reveal, so a client can't cheat by
  inspecting state it shouldn't see.

See `src/net/network.js` (transport) and `src/hooks/useGame.js` (orchestration).

## Project layout

```
src/
  game/
    tiles.js     tile model, 136-tile wall, shuffle, dora, sorting
    agari.js     winning-hand detection & decomposition (standard / chiitoi / kokushi)
    score.js     yaku detection, fu/han, point calculation, dora counting
    engine.js    host-authoritative state machine + per-player views
  net/
    network.js   thin transport wrapper over @trystero-p2p/nostr
  hooks/
    useGame.js   ties the engine to the network (host vs client roles)
  components/    React + MUI UI (board, hand, discards, melds, controls, lobby, …)
tests/           node:test suites for the engine & scorer
```

## Rules implemented

- Full deal, draw/discard, turn order, dealer rotation, honba & riichi sticks.
- **Calls:** pon, chi, open/closed/added kan, with correct priority resolution
  and multiple-ron.
- **Wins:** tsumo and ron, with a furiten check (own-discard, temporary, and
  riichi furiten).
- **Riichi** (incl. double riichi & ippatsu), and ankan-during-riichi wait
  protection.
- **Yaku:** riichi, ippatsu, menzen tsumo, pinfu, tanyao, iipeikou, yakuhai,
  sanshoku (doujun/doukou), ittsuu, chanta, junchan, toitoi, sanankou, sankantsu,
  chiitoitsu, honroutou, shousangen, honitsu, chinitsu, ryanpeikou, haitei/houtei,
  rinshan, chankan. **Yakuman:** kokushi (+13-sided), suuankou (+tanki),
  daisangen, dai/shousuushi, tsuuiisou, chinroutou, ryuuiisou, suukantsu,
  chuuren poutou, tenhou/chiihou. Plus dora / ura-dora / kan-dora.
- **Fu/han scoring** with the standard limit tiers (mangan → yakuman, incl. kazoe).
- **Exhaustive draw** (ryuukyoku) with tenpai/noten payments and dealer-keep rules.
- Defaults to a **tonpuusen** (East-only) match; pass `{ hanchan: true }` to
  `createGame` for a full East+South match.

## Notes & limitations

- No red-five (aka dora). No nagashi mangan, no abortive draws (kyuushu kyuuhai,
  four-kan/four-riichi/four-wind aborts), no pao/sekinin-barai.
- Late joins / reconnection are not supported — all four players join before the
  host starts, and the host must stay connected.
- Matchmaking uses public Nostr relays; the first connection can take a few
  seconds. Restrictive NATs/firewalls may block WebRTC.
