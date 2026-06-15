# CLAUDE.md

Guidance for working in this repo. Read alongside `README.md` (player-facing) — this file covers architecture and conventions.

## What this is

A 4-player Japanese **riichi mahjong** game that runs entirely in the browser with **no game server**. Players connect peer-to-peer over WebRTC, matchmade over Nostr relays via `@trystero-p2p/nostr`. Stack: **React + Material UI + Vite**, **plain JavaScript (no TypeScript)**.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # production build to dist/ (use this to check it compiles)
npm run preview  # serve the built dist/
npm test         # node --test: scorer, randomized engine sim, full-flow
```

- Tests use Node's built-in runner (`node:test` + `node:assert`); `npm test` is just `node --test`, which auto-discovers `test/*.test.js`. They import from `src/game/` and assert on scores, deltas, and yaku. The engine test drives 300 randomized full rounds and asserts the engine never throws or stalls. Deals with random dora are pinned (`state.doraIndicators`) where exact payments are asserted.
- **Tile-face preview:** open the app at `#tiles` (`App.jsx` renders `<TilePreview/>`) to see all 34 tile faces and size/rotation variants without starting a game.

## Conventions

- **Plain JS only** — do not introduce TypeScript. ESM modules (`"type": "module"`).
- No single-character variable names except `for`-loop indices.
- Match the surrounding MUI `sx`-prop styling style; avoid adding CSS files.
- After non-trivial changes, run `npm run build` to confirm it still compiles (cheap, catches import/JSX errors).

## Architecture: host-authoritative P2P

One peer is the **host** and owns the single source of truth. Clients send action *intents*; the host validates, advances the engine, and broadcasts a **per-player sanitized view** to each peer. There is no manual create/join: every peer enters the same room code and `useGame.js` runs a short lobby **host election** (exchange `claim` messages, settle after ~1.2s; first/lowest-id peer with no existing host wins, newcomers defer to an established host). Election is lobby-only — once a game starts the host is fixed and cannot be handed off.

```
src/game/        pure game logic (no React, no network) — covered by test/
  tiles.js       tile model, 136-tile wall, shuffle, dora, sorting, names
  agari.js       winning-hand detection & decomposition (standard/chiitoi/kokushi), tenpai
  score.js       yaku detection, fu/han, points, dora counting
  engine.js      authoritative GameState machine + viewFor() sanitization
  bot.js         computer-opponent AI (shanten/efficiency discards, riichi, call responses)
src/net/
  network.js     thin wrapper over @trystero-p2p/nostr (transport only)
src/hooks/
  useGame.js     ties engine + network together; host vs client roles, bot driver, error/connection state
src/components/  React + MUI UI
  Tile.jsx / TileFace.jsx   one tile; faces are SVG from the `tilekit` lib (no image assets)
  CenterTable.jsx           center cluster: 4 discard ponds around the score/wall square
  PlayerArea.jsx            an opponent's edge region (hand/melds/tag, no discards)
  GameBoard.jsx             table layout + self area; provides nothing global
  ...                       Lobby, Home, Controls, ResultDialog, Pieces, EmojiPicker, etc.
src/App.jsx      Home -> GameSession (AppBar + Lobby/GameBoard); owns the TileHover provider
```

### Key invariants / gotchas

- **No `<React.StrictMode>`** (see `main.jsx`). StrictMode double-invokes effects in dev; `useGame`'s effect joins a Trystero room on mount and leaves on cleanup, so the double-invoke makes each tab join→leave→rejoin with the same `selfId` and breaks P2P signaling. Keep it off.
- **`viewFor(state, playerId)`** in `engine.js` is the anti-cheat boundary: opponents' concealed hands are sent as *counts* (numbers), not arrays; the live wall is a count; ura-dora is withheld until round end. Anything UI shows must come from the per-player view, never the full state. Code that counts "visible tiles" relies on opponents' hands being numbers.
- **Engine is the only place rules live.** `applyAction(state, seat, action)` returns the next state and silently ignores illegal actions. `selfOptions`/`computeCalls` decide what's offered. `startRound` already draws the dealer's first tile (don't call `beginTurn` again after it).
- **Relays:** `network.js` uses the `@trystero-p2p/nostr` package's default public Nostr relays for matchmaking. A "WebSocket … failed" console line for one relay is non-fatal — only one needs to connect.
- **Build base path:** `vite.config.js` hardcodes `base: '/tenpai/'` so the production build works as a GitHub Pages project site at `csimi.github.io/tenpai/`. The dev server is unaffected, but `npm run preview` serves under `/tenpai/`. Building for any other host (root domain, different repo name) requires changing this.
- **Tile art comes from the `tilekit` library** (vector SVG; pin = dot layouts, sou = bamboo with the 1-sou bird, man/honors = Kai brush-stroke kanji via `hanzi-writer-data`, plus the green ribbed face-down back). `TileFace.jsx` calls `tileToSvg`: for face-up tiles with a *transparent* body (no fill/edge/depth) so only the face symbols draw over the ivory body that `Tile.jsx` paints; for face-down it renders tilekit's opaque `'back'` tile instead. `Tile.jsx` still owns the body sizing, drop shadow, and interactive states (selected/highlight/dim/rotated). Note tilekit draws the white dragon (haku) as a blank face, not the old blue frame. Our tile kinds use the rank-first riichi/tenhou standard (`"1m"`, `"5z"` — rank then suit), matching tilekit's notation, so kinds pass straight to `tileToSvg` with no conversion. Tile sizes are responsive `clamp(...vmin...)` in `Tile.jsx` `SIZES`; rotation centering uses CSS `calc()` because dims are CSS expressions, not numbers.
- **Seat layout is POV-based.** Each player faces the center; tags go on the player's left, melds on their right, discards toward the center — which maps to different screen edges per seat (`PlayerArea.jsx`, `GameBoard.jsx` orientation props).
- **Bots run on the host.** Empty lobby seats are filled with bot players (`{ bot: true }`, no peer id) when the host starts; `buildSeating` in `useGame.js` spreads humans apart (two humans → seats 0 & 2, bots on the sides). After every `broadcast()`, the host's `runBots` driver checks whether the seat that must act next (a discard turn, or a pending call) is a bot and, if so, schedules its move (`BOT_DELAY`) — applying it re-broadcasts and chains the next bot move. `broadcast()` skips bots (no peer to send a view to). A human who disconnects mid-game is converted in place to a bot (`onPeerLeave`), so the round never stalls. Bot decisions live in `bot.js` and only read the bot's own hand + public board (no cheating); they pass on pon/chi/kan to stay closed.
- **Tile hover** (tiles-remaining tooltip + highlight of visible copies) uses `TileHoverContext` provided at `GameSession` level (so the header dora indicators participate too). The hovered tile is excluded from its own highlight by `useId` identity, not CSS `:hover` (avoids a mouse-out flicker).
- Match defaults to **East-only (tonpuusen)**; `createGame(players, { hanchan: true })` for East+South.

## Limitations (intentional)

No abortive draws (kyuushu kyuuhai, four-kan/riichi/wind), no pao/sekinin-barai, no reconnection or late-join (the host must stay connected). Empty seats are filled with bots at start and a human who drops mid-game is replaced by a bot, so a table no longer needs four humans — but the host can't be replaced.

Red-five (aka) dora **is** supported: a host lobby toggle (default on, `createGame(players, { aka: true })`) swaps one 5 of each suit for its red variant. Red fives use tilekit's `'0m'/'0p'/'0s'` kinds and stay in engine state (hands/melds/discards/wall) for display + aka counting; everything rule-related normalizes via `baseKind()` (`tiles.js`) so a red five is an ordinary five for agari, yaku, calls and furiten, and the scorer adds one "Aka Dora" han per red five in the winning tiles.
