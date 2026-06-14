import { Box, Typography } from '@mui/material'
import Tile from './Tile.jsx'
import { DoraIndicators } from './Pieces.jsx'

const WIND_NAME = { '1z': 'East', '2z': 'South', '3z': 'West', '4z': 'North' }

// Round / dora / wall / riichi-stick info, rendered inline so it can live in
// the app header bar (no separate bar of its own).
export default function GameStatus({ view }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {WIND_NAME[view.roundWind]} {view.roundNumber}
        {view.honba > 0 ? ` · ${view.honba} honba` : ''}
      </Typography>
      <DoraIndicators indicators={view.doraIndicators} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Tile facedown size="sm" />
        <Typography variant="body2">{view.wallCount}</Typography>
      </Box>
      {view.riichiSticks > 0 && (
        <Typography variant="body2" sx={{ color: '#cdbf94' }}>Sticks: {view.riichiSticks}</Typography>
      )}
    </Box>
  )
}
