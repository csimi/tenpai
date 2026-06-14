import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, Typography, Chip, Divider, Stack
} from '@mui/material'
import Tile from './Tile.jsx'
import { Melds, DoraReveal } from './Pieces.jsx'
import { removeOne } from '../game/tiles.js'

const fmt = (value) => (value > 0 ? `+${value}` : `${value}`)

function ScoreTable({ view, deltas }) {
  return (
    <Stack spacing={0.5} sx={{ mt: 1 }}>
      {view.players.map((player, seat) => (
        <Box key={seat} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            {player.name}{seat === view.you ? ' (you)' : ''}
            {seat === view.dealer && (
              <Chip size="small" label="Dealer" sx={{ height: 18, fontSize: 11, bgcolor: '#e0b343', color: '#1a1a1a' }} />
            )}
          </Box>
          <span>
            {view.scores[seat].toLocaleString()}
            {deltas && deltas[seat] !== 0 && (
              <Box component="span" sx={{ ml: 1, color: deltas[seat] > 0 ? '#7CFC9A' : '#ff8a80' }}>
                {fmt(deltas[seat])}
              </Box>
            )}
          </span>
        </Box>
      ))}
    </Stack>
  )
}

function WinBlock({ win, view }) {
  const winnerName = view.players[win.seat]?.name || `Seat ${win.seat}`
  const fromName = win.from != null ? (view.players[win.from]?.name || `Seat ${win.from}`) : null
  const concealed = win.isTsumo ? removeOne(win.hand, win.winningTile) : win.hand
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ color: '#e0b343' }}>
        {winnerName} — {win.isTsumo ? 'Tsumo' : `Ron (off ${fromName})`}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', my: 1, alignItems: 'flex-end' }}>
        {/* The hand without the winning tile, then that tile set apart and
            highlighted. On a ron win.hand is the 13-tile hand (the winning tile
            isn't in it); on a tsumo it's in there, so drop one copy. */}
        {concealed.map((tile, idx) => (
          <Tile key={idx} tile={tile} size="sm" />
        ))}
        <Box sx={{ ml: 1 }}><Tile tile={win.winningTile} size="sm" highlight /></Box>
        <Box sx={{ ml: 1 }}><Melds melds={win.melds} /></Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
        {win.yaku.map((entry, idx) => (
          <Chip key={idx} size="small" label={`${entry.name}${entry.han ? ` ${entry.han}` : ''}`} />
        ))}
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {win.isYakuman ? win.limitName : (
          <>
            {win.han} han {win.fu ? `${win.fu} fu` : ''} {win.limitName ? `— ${win.limitName}` : ''}
          </>
        )}
      </Typography>
      <PaymentBreakdown win={win} view={view} />
    </Box>
  )
}

// Explains who pays what — in particular why, on a non-dealer tsumo, the dealer
// is deducted double.
function PaymentBreakdown({ win, view }) {
  const pay = win.payment
  if (!pay) return null
  const honba = view.result.honba || 0
  const perHonbaTsumo = honba * 100 // each payer adds 100 per honba on a tsumo

  if (!win.isTsumo) {
    const fromName = win.from != null ? (view.players[win.from]?.name || `Seat ${win.from}`) : '—'
    const amount = pay.ron + honba * 300
    return (
      <Typography variant="body2" sx={{ color: '#cdbf94', mt: 0.5 }}>
        {fromName} pays {amount.toLocaleString()}{honba > 0 ? ` (incl. ${honba * 300} honba)` : ''}
      </Typography>
    )
  }

  if (pay.byDealerTsumo) {
    const each = pay.tsumoEachNonDealer + perHonbaTsumo
    return (
      <Typography variant="body2" sx={{ color: '#cdbf94', mt: 0.5 }}>
        Dealer tsumo — each of the other 3 pays {each.toLocaleString()}.
      </Typography>
    )
  }
  const nonDealer = pay.tsumoFromNonDealer + perHonbaTsumo
  const dealer = pay.tsumoFromDealer + perHonbaTsumo
  return (
    <Typography variant="body2" sx={{ color: '#cdbf94', mt: 0.5 }}>
      Tsumo — each non-dealer pays {nonDealer.toLocaleString()}, the dealer pays {dealer.toLocaleString()} (dealer always pays double on a tsumo).
    </Typography>
  )
}

export default function ResultDialog({ view, isHost, onNext }) {
  const result = view.result
  const open = (view.phase === 'roundEnd' || view.phase === 'gameEnd') && !!result
  if (!open) return null

  const gameOver = view.phase === 'gameEnd'

  // Title from the viewer's perspective — losers shouldn't see "Win!".
  let title = 'Exhaustive draw'
  if (gameOver) {
    title = 'Game over'
  } else if (result.type === 'win') {
    const youWon = result.wins.some((win) => win.seat === view.you)
    const youDealtIn = result.wins.some((win) => win.from === view.you)
    if (youWon) title = 'You win!'
    else if (youDealtIn) title = 'You dealt in'
    else if (result.wins.length > 1) title = 'Round won'
    else title = `${view.players[result.wins[0].seat]?.name || 'Player'} wins`
  }

  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {result.type === 'win' && result.wins.map((win, idx) => (
          <WinBlock key={idx} win={win} view={view} />
        ))}

        {result.type === 'draw' && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Tenpai: {result.tenpai.map((isTenpai, seat) => isTenpai ? view.players[seat].name : null).filter(Boolean).join(', ') || 'none'}
            </Typography>
          </Box>
        )}

        {result.type === 'win' && (
          <>
            <DoraReveal label="Dora" indicators={result.doraIndicators} />
            <DoraReveal label="Ura dora" indicators={result.uraDoraIndicators} />
          </>
        )}

        <Divider sx={{ my: 1 }} />
        <ScoreTable view={view} deltas={result.deltas} />

        {gameOver && (
          <Typography variant="h6" sx={{ mt: 2, color: '#e0b343' }}>
            Winner: {(() => {
              let best = 0
              view.scores.forEach((score, seat) => { if (score > view.scores[best]) best = seat })
              return view.players[best].name
            })()}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {!gameOver && isHost && (
          <Button variant="contained" onClick={onNext}>Next round</Button>
        )}
        {!gameOver && !isHost && (
          <Typography variant="caption" sx={{ p: 1, color: '#cdbf94' }}>
            Waiting for host to start the next round…
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  )
}
