import { Box, Typography } from '@mui/material'
import { Discards } from './Pieces.jsx'

// The classic online-riichi center: a square showing the wall count, round,
// riichi sticks and each player's score, with the four discard ponds arranged
// around it (each in front of its player).

const WIND = { '1z': 'E', '2z': 'S', '3z': 'W', '4z': 'N' }
const WIND_NAME = { '1z': 'East', '2z': 'South', '3z': 'West', '4z': 'North' }
const seatWindKind = (seat, dealer) => ['1z', '2z', '3z', '4z'][(seat - dealer + 4) % 4]

function ScoreCell({ view, seat }) {
  const isTurn = seat === view.turn && view.phase === 'playing'
  const isDealer = seat === view.dealer
  return (
    <Box
      sx={{
        textAlign: 'center',
        px: 1, py: 0.25,
        borderRadius: 1,
        minWidth: 56,
        background: isTurn ? 'rgba(224,179,67,0.25)' : 'transparent',
        border: isTurn ? '1px solid #e0b343' : '1px solid transparent'
      }}
    >
      <Typography variant="caption" sx={{ color: isDealer ? '#e0b343' : '#cdbf94', fontWeight: 700 }}>
        {WIND[seatWindKind(seat, view.dealer)]}{view.riichi[seat] ? ' •' : ''}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
        {view.scores[seat].toLocaleString()}
      </Typography>
    </Box>
  )
}

function MiddleBox({ view }) {
  return (
    <Box sx={{ textAlign: 'center', px: 1 }}>
      <Typography variant="caption" sx={{ color: '#cdbf94', display: 'block' }}>
        {WIND_NAME[view.roundWind]} {view.roundNumber}{view.honba > 0 ? ` · ${view.honba}b` : ''}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>{view.wallCount}</Typography>
      {view.riichiSticks > 0 && (
        <Typography variant="caption" sx={{ color: '#cdbf94' }}>● {view.riichiSticks}</Typography>
      )}
    </Box>
  )
}

export default function CenterTable({ view, seatAt }) {
  const you = view.you
  // Each pond is drawn from its player's point of view: self upright, across
  // upside-down, left/right turned toward their own seat.
  const ORIENT = { 0: 0, 1: 270, 2: 180, 3: 90 }
  const pond = (relative) => {
    const seat = seatAt(relative)
    const lastIndex = view.lastDiscard && view.lastDiscard.seat === seat ? view.lastDiscard.index : -1
    return <Discards discards={view.discards[seat]} lastIndex={lastIndex} orient={ORIENT[relative]} size="lg" />
  }
  const cell = { display: 'flex', alignItems: 'center', justifyContent: 'center' }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto auto auto',
        gridTemplateRows: 'auto auto auto',
        gap: 0.5,
        alignItems: 'center',
        justifyItems: 'center'
      }}
    >
      <Box sx={{ ...cell, gridColumn: 2, gridRow: 1 }}>{pond(2)}</Box>
      <Box sx={{ ...cell, gridColumn: 1, gridRow: 2 }}>{pond(3)}</Box>

      {/* Inner score/wall square */}
      <Box
        sx={{
          ...cell, gridColumn: 2, gridRow: 2,
          border: '2px solid rgba(224,179,67,0.3)',
          borderRadius: 2,
          background: 'rgba(0,0,0,0.25)',
          p: 0.5
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gridTemplateRows: 'auto auto auto', alignItems: 'center', justifyItems: 'center', gap: 0.25 }}>
          <Box sx={{ gridColumn: 2, gridRow: 1 }}><ScoreCell view={view} seat={seatAt(2)} /></Box>
          <Box sx={{ gridColumn: 1, gridRow: 2 }}><ScoreCell view={view} seat={seatAt(3)} /></Box>
          <Box sx={{ gridColumn: 2, gridRow: 2 }}><MiddleBox view={view} /></Box>
          <Box sx={{ gridColumn: 3, gridRow: 2 }}><ScoreCell view={view} seat={seatAt(1)} /></Box>
          <Box sx={{ gridColumn: 2, gridRow: 3 }}><ScoreCell view={view} seat={you} /></Box>
        </Box>
      </Box>

      <Box sx={{ ...cell, gridColumn: 3, gridRow: 2 }}>{pond(1)}</Box>
      <Box sx={{ ...cell, gridColumn: 2, gridRow: 3 }}>{pond(0)}</Box>
    </Box>
  )
}
