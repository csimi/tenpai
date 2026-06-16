import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Box, AppBar, Toolbar, Typography, Button, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions
} from '@mui/material'
import Home from './components/Home.jsx'
import Lobby from './components/Lobby.jsx'
import GameBoard from './components/GameBoard.jsx'
import ConnectionStatus from './components/ConnectionStatus.jsx'
import GameStatus from './components/GameStatus.jsx'
import YakuList from './components/YakuList.jsx'
import TilePreview from './components/TilePreview.jsx'
import { TileHoverContext } from './components/tileHover.js'
import { baseKind } from './game/tiles.js'
import { useGame } from './hooks/useGame.js'

// Phones held sideways have little vertical room, so the top bar would eat too
// much of it and moves to a left sidebar. Detect "landscape phone" by a wide
// aspect ratio (phones are >=18:9, so >=2:1 sideways; tablets are ~4:3) on a
// touch pointer (excludes desktops). Aspect ratio is used instead of an absolute
// max-height because high-DPI phones (e.g. Xperia 1 21:9) report a tall CSS
// viewport that an absolute height cap misses.
const SIDEBAR_MQ = '@media (orientation: landscape) and (pointer: coarse) and (min-aspect-ratio: 17/10)'

// How many copies of a kind the local player can see (own hand + everyone's
// discards/melds + dora indicators) and how many of the 4 remain unseen.
// Opponents' concealed hands are counts in the view, never arrays, so their
// hidden tiles are not counted. Called tiles are skipped in the pond since the
// meld they joined already counts them.
function seenInfo(view, kind) {
  if (!view) return { visible: 0, remaining: 4 }
  // A red five and its ordinary five are the same kind for counting, so compare
  // base kinds (there are still only four of each five in total).
  const want = baseKind(kind)
  const matches = (tile) => baseKind(tile) === want
  let visible = 0
  for (const hand of view.hands || []) {
    if (Array.isArray(hand)) visible += hand.filter(matches).length
  }
  for (const pile of view.discards || []) {
    visible += pile.filter((entry) => matches(entry.tile) && !entry.called).length
  }
  for (const melds of view.melds || []) {
    for (const meld of melds) visible += meld.tiles.filter(matches).length
  }
  visible += (view.doraIndicators || []).filter(matches).length
  return { visible, remaining: Math.max(0, 4 - visible) }
}

// Mounted once the player has entered a room. Owns the live session.
function GameSession({ config, onLeave }) {
  const {
    view, roster, chat, emotes, status, isHost, canStart, net, warning, error, ended, dismissError,
    akaDora, setAkaDora, matchLength, setMatchLength, timeLimit, setTimeLimit, sendAction, startGame, goNextRound, sendChat, sendEmote
  } = useGame(config)

  const inGame = !!view
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showYaku, setShowYaku] = useState(false)

  // Hover state shared across every tile (hand, ponds, melds, dora indicators
  // in the header) so the "tiles seen / left" tooltip and match-highlight stay
  // consistent everywhere.
  const [hovered, setHovered] = useState(null)
  const infoFor = useCallback((kind) => seenInfo(view, kind), [view])
  const hoverValue = useMemo(() => ({ hovered, setHovered, infoFor }), [hovered, infoFor])
  // Drop any hover when the board changes: the hovered tile may have moved or been
  // removed (discard/draw/call) without firing a mouse-leave, which would
  // otherwise leave its highlight and tooltip stuck on.
  useEffect(() => { setHovered(null) }, [view])

  return (
    <TileHoverContext.Provider value={hoverValue}>
    <Box sx={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', [SIDEBAR_MQ]: { flexDirection: 'row' } }}>
      <AppBar position="static" color="default" enableColorOnDark sx={{ [SIDEBAR_MQ]: { width: 'auto', height: '100%' } }}>
        <Toolbar
          variant="dense"
          sx={{
            gap: 2, flexWrap: 'wrap', py: 0.5,
            // On short landscape (phone held sideways) the bar becomes a vertical
            // sidebar, so stack its contents and let the spacer push Leave to the
            // bottom; scroll if the items overflow the height.
            [SIDEBAR_MQ]: {
              flexDirection: 'column', alignItems: 'flex-start', flexWrap: 'nowrap',
              height: '100%', py: 1, overflowY: 'auto'
            }
          }}
        >
          <Typography variant="h6" sx={{ color: '#e0b343', fontWeight: 800 }}>Tenpai</Typography>
          <Typography variant="body2" sx={{ color: '#cdbf94' }}>Room {config.roomId}</Typography>
          <ConnectionStatus net={net} inGame={inGame} />
          {inGame && <GameStatus view={view} />}
          <Box sx={{ flex: 1 }} />
          <Button color="inherit" size="small" onClick={() => setShowYaku(true)}>Yaku</Button>
          <Button color="inherit" size="small" onClick={() => setConfirmLeave(true)}>Leave</Button>
        </Toolbar>
      </AppBar>

      <YakuList open={showYaku} onClose={() => setShowYaku(false)} />

      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)}>
        <DialogTitle>Leave the game?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {isHost
              ? 'You are the host — leaving ends the game for everyone.'
              : 'You will leave this room and return to the main menu.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLeave(false)}>Stay</Button>
          <Button color="error" variant="contained" onClick={onLeave}>Leave</Button>
        </DialogActions>
      </Dialog>

      {/* Content column beside the bar (below it normally, right of it when the
          bar is a landscape sidebar). Scrolls internally so tall content (e.g. the
          lobby on a short landscape screen) never grows the layout or pushes the
          bar off-screen. */}
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {/* Non-fatal connection guidance — visible in-game too, not just the lobby. */}
        {warning && (
          <Alert severity="warning" variant="filled" sx={{ borderRadius: 0 }}>{warning}</Alert>
        )}

        <Box sx={{ flex: 1, minHeight: 0 }}>
          {inGame ? (
            <GameBoard view={view} isHost={isHost} sendAction={sendAction} goNextRound={goNextRound} emotes={emotes} sendEmote={sendEmote} />
          ) : (
            <Lobby
              roomId={config.roomId}
              roster={roster}
              isHost={isHost}
              canStart={canStart}
              onStart={startGame}
              akaDora={akaDora}
              onToggleAka={setAkaDora}
              matchLength={matchLength}
              onChangeMatchLength={setMatchLength}
              timeLimit={timeLimit}
              onChangeTimeLimit={setTimeLimit}
              chat={chat}
              onSend={sendChat}
              status={status}
              net={net}
            />
          )}
        </Box>
      </Box>

      {/* The host left mid-game: there's no one left to run the round, so end the
          match and send the player back to the menu (no Stay option). */}
      <Dialog open={!!ended}>
        <DialogTitle>Game over</DialogTitle>
        <DialogContent>
          <DialogContentText>{ended}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color="primary" variant="contained" onClick={onLeave}>Return to menu</Button>
        </DialogActions>
      </Dialog>

      {/* Dismissible error toast for engine/transport failures. */}
      <Snackbar
        open={!!error}
        onClose={dismissError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={dismissError} variant="filled" sx={{ maxWidth: 600 }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
    </TileHoverContext.Provider>
  )
}

export default function App() {
  const [config, setConfig] = useState(null)

  // Dev aid: view all tile faces at #tiles.
  if (typeof window !== 'undefined' && window.location.hash === '#tiles') return <TilePreview />

  if (!config) return <Home onEnter={setConfig} />
  return <GameSession config={config} onLeave={() => setConfig(null)} />
}
