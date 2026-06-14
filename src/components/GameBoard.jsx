import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'
import PlayerArea from './PlayerArea.jsx'
import CenterTable from './CenterTable.jsx'
import Hand from './Hand.jsx'
import Controls from './Controls.jsx'
import ResultDialog from './ResultDialog.jsx'
import { Melds, SeatTag } from './Pieces.jsx'

// Renders its child at its natural size, then scales it down uniformly so it
// always fits the available area — no scrollbars, and every tile keeps the same
// size relative to the others regardless of the window's aspect ratio. (A 13-tile
// side hand makes the table tall; on a wide, short window that would otherwise
// overflow vertically.)
function FitBox({ children }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return undefined
    const compute = () => {
      // offsetWidth/Height are the natural layout size (transforms don't affect
      // them), so there's no feedback loop when we change the scale.
      const natW = inner.offsetWidth
      const natH = inner.offsetHeight
      if (!natW || !natH) return
      setScale(Math.min(1, outer.clientWidth / natW, outer.clientHeight / natH))
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <Box ref={outerRef} sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box ref={innerRef} sx={{ flexShrink: 0, transform: `scale(${scale})`, transformOrigin: 'center' }}>
        {children}
      </Box>
    </Box>
  )
}

export default function GameBoard({ view, isHost, sendAction, goNextRound, emotes = {}, sendEmote }) {
  const [riichiMode, setRiichiMode] = useState(false)
  const you = view.you
  const yourTurn = view.turn === you && view.state === 'discard'

  // Leave riichi-selection mode whenever it's no longer your discard.
  useEffect(() => {
    if (!yourTurn) setRiichiMode(false)
  }, [yourTurn])

  const seatAt = (relative) => (you + relative + 4) % 4

  const onDiscard = (tile) => {
    if (riichiMode) {
      sendAction({ type: 'riichi', tile })
      setRiichiMode(false)
    } else {
      sendAction({ type: 'discard', tile })
    }
  }

  const cellSx = { display: 'flex', justifyContent: 'center', alignItems: 'center', p: 0.5 }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Table: opponents at the edges, ponds + scores in the center cluster,
          self area along the bottom. The whole thing is sized to its content and
          scaled to fit (FitBox). Round/dora/wall status lives in the header. */}
      <FitBox>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto auto auto',
            gridTemplateRows: 'auto auto auto',
            gap: 1,
            p: 1
          }}
        >
          <Box sx={{ ...cellSx, gridColumn: 2, gridRow: 1, alignItems: 'flex-start' }}>
            <PlayerArea view={view} seat={seatAt(2)} orientation="top" emote={emotes[seatAt(2)]} />
          </Box>
          <Box sx={{ ...cellSx, gridColumn: 1, gridRow: 2 }}>
            <PlayerArea view={view} seat={seatAt(3)} orientation="left" emote={emotes[seatAt(3)]} />
          </Box>
          <Box sx={{ ...cellSx, gridColumn: 3, gridRow: 2 }}>
            <PlayerArea view={view} seat={seatAt(1)} orientation="right" emote={emotes[seatAt(1)]} />
          </Box>

          {/* Center: discard ponds around the score/wall square */}
          <Box sx={{ ...cellSx, gridColumn: 2, gridRow: 2 }}>
            <CenterTable view={view} seatAt={seatAt} />
          </Box>

          {/* Self: action buttons, then [tag] [hand] [melds] */}
          <Box sx={{ ...cellSx, gridColumn: '1 / -1', gridRow: 3, flexDirection: 'column', gap: 1 }}>
            <Controls
              view={view}
              riichiMode={riichiMode}
              onToggleRiichi={() => setRiichiMode((mode) => !mode)}
              onTsumo={() => sendAction({ type: 'tsumo' })}
              onKanClosed={(kan) => sendAction({ type: 'kan', kind: kan.kind, tile: kan.tile })}
              onCall={(call) => sendAction({ type: 'callResponse', response: call })}
              onPass={() => sendAction({ type: 'callResponse', response: { type: 'pass' } })}
            />
            {Array.isArray(view.hands?.[you]) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <SeatTag
                  seat={you}
                  name={view.players[you]?.name || 'You'}
                  isDealer={you === view.dealer}
                  isTurn={you === view.turn && view.phase === 'playing'}
                  inRiichi={view.riichi[you]}
                  dealer={view.dealer}
                  showScore={false}
                  waits={view.yourWaits}
                  emote={emotes[you]}
                  onEmote={sendEmote}
                />
                <Hand
                  tiles={view.hands[you]}
                  drawnTile={view.drawnTile}
                  onDiscard={onDiscard}
                  riichiMode={riichiMode}
                  riichiTiles={view.selfOptions?.riichi}
                  alreadyRiichi={view.riichi[you] && !view.selfOptions?.riichi}
                  yourTurn={yourTurn}
                />
                <Melds melds={view.melds[you]} size="lg" />
              </Box>
            )}
          </Box>
        </Box>
      </FitBox>

      <ResultDialog view={view} isHost={isHost} onNext={goNextRound} />
    </Box>
  )
}
