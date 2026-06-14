import { Box, Typography, Paper } from '@mui/material'
import Tile from './Tile.jsx'
import { ALL_KINDS } from '../game/tiles.js'

// Dev aid: render every tile face. Open the app at #tiles to view.
export default function TilePreview() {
  const rows = [
    ['Man', ALL_KINDS.filter((kind) => kind[0] === 'm')],
    ['Pin', ALL_KINDS.filter((kind) => kind[0] === 'p')],
    ['Sou', ALL_KINDS.filter((kind) => kind[0] === 's')],
    ['Honors', ALL_KINDS.filter((kind) => kind[0] === 'z')]
  ]
  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 2, color: '#e0b343' }}>Tile faces</Typography>
      <Paper sx={{ p: 2 }}>
        {rows.map(([label, kinds]) => (
          <Box key={label} sx={{ mb: 3 }}>
            <Typography variant="overline" sx={{ color: '#cdbf94' }}>{label}</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
              {kinds.map((kind) => (
                <Box key={kind} sx={{ textAlign: 'center' }}>
                  <Tile tile={kind} size="lg" />
                  <Typography variant="caption" sx={{ display: 'block', color: '#8a9' }}>{kind}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <Tile tile="1s" size="sm" />
          <Tile tile="5p" size="md" />
          <Tile tile="3m" size="lg" />
          <Tile tile="6z" size="md" rotated />
          <Tile facedown size="lg" />
          <Tile tile="7z" size="lg" highlight />
          <Tile tile="9p" size="lg" selected />
        </Box>
      </Paper>
    </Box>
  )
}
