import { Box, Button, Stack, Typography } from '@mui/material'
import Tile from './Tile.jsx'

// Action buttons. Two contexts:
//  - your own turn (selfOptions): Tsumo / Riichi / Kan
//  - responding to a discard (callOptions): Ron / Pon / Kan / Chi / Pass
export default function Controls({
  view, riichiMode, onToggleRiichi, onTsumo, onKanClosed, onCall, onPass
}) {
  const buttons = []

  // Your-turn options.
  if (view.selfOptions && view.turn === view.you && view.state === 'discard') {
    const opts = view.selfOptions
    if (opts.tsumo) buttons.push(
      <Button key="tsumo" variant="contained" color="error" onClick={onTsumo}>Tsumo</Button>
    )
    if (opts.riichi) buttons.push(
      <Button key="riichi" variant={riichiMode ? 'contained' : 'outlined'} color="warning" onClick={onToggleRiichi}>
        {riichiMode ? 'Pick discard…' : 'Riichi'}
      </Button>
    )
    if (opts.kan) opts.kan.forEach((kan, idx) => buttons.push(
      <Button key={`kan${idx}`} variant="outlined" onClick={() => onKanClosed(kan)}>
        Kan&nbsp;<Tile tile={kan.tile} size="sm" />
      </Button>
    ))
  }

  // Call options on someone else's discard. Show the tile(s) each call forms so
  // it's clear what you're calling (the discarded tile is `view.callTile`).
  if (view.callPending && view.callOptions) {
    const opts = view.callOptions
    const called = view.callTile
    const tiles = (count) => (
      <Box sx={{ display: 'inline-flex', gap: '1px', ml: 0.5 }}>
        {Array.from({ length: count }).map((_, idx) => (
          <Tile key={idx} tile={called} size="sm" highlight={idx === 0} />
        ))}
      </Box>
    )
    if (opts.ron) buttons.push(
      <Button key="ron" variant="contained" color="error" onClick={() => onCall({ type: 'ron' })}>
        Ron{called && tiles(1)}
      </Button>
    )
    if (opts.kan) buttons.push(
      <Button key="ckan" variant="outlined" onClick={() => onCall({ type: 'kan' })}>
        Kan{called && tiles(4)}
      </Button>
    )
    if (opts.pon) buttons.push(
      <Button key="pon" variant="outlined" onClick={() => onCall({ type: 'pon' })}>
        Pon{called && tiles(3)}
      </Button>
    )
    if (opts.chi) opts.chi.forEach((seq, idx) => buttons.push(
      <Button key={`chi${idx}`} variant="outlined" onClick={() => onCall({ type: 'chi', tiles: seq })}>
        Chi&nbsp;<Box sx={{ display: 'inline-flex', gap: '1px' }}>{seq.map((tile, ti) => <Tile key={ti} tile={tile} size="sm" highlight={tile === called} />)}</Box>
      </Button>
    ))
    buttons.push(
      <Button key="pass" variant="text" color="inherit" onClick={onPass}>Pass</Button>
    )
  }

  if (buttons.length === 0) {
    // A call window is open but we have no (further) action — either we've
    // already answered or another seat is deciding. Show that we're waiting so a
    // declared call (e.g. ron) doesn't look like it was ignored.
    if (view.callPending) {
      return (
        <Typography variant="body2" sx={{ color: '#cdbf94' }}>
          {view.callResponded ? 'Call registered — waiting for other players…' : 'Waiting for other players…'}
        </Typography>
      )
    }
    return null
  }

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'center', alignItems: 'center' }}>
      {buttons}
    </Stack>
  )
}
