import { useMemo } from 'react'
import { Box } from '@mui/material'
import { tileToSvg } from 'tilekit'

// Tile art is drawn by the `tilekit` library (SVG, no image assets). It owns the
// face artwork (dot/bamboo layouts, the 1-sou bird, calligraphic kanji as real
// Kai brush strokes) and the green ribbed face-down back.
//
// Our tile kinds ("1m", "5z") are already tilekit's rank-first notation, so they
// pass straight through with no conversion.
//
// Face-up: Tile.jsx already paints the ivory body, border, shadow and all the
// interactive states (selected/highlight/dim/rotated), so we want only the face
// symbols — we render a tilekit tile with its own body made invisible (no
// faux-3D depth, transparent face fill + edge) so just the symbols sit on top of
// Tile.jsx's body.
//
// Face-down: there is no ivory body to layer onto, so we let tilekit draw its
// full opaque green back (still flat — depth 0 — with the drop shadow coming
// from Tile.jsx).
//
// `fit: true` makes the root <svg> scale to its container via its viewBox.
const FACE_OPTS = {
  fit: true,
  depth: 0,
  background: null,
  faceColor: 'transparent',
  faceColorTop: 'transparent',
  edgeColor: 'transparent'
}
const BACK_OPTS = { fit: true, depth: 0, background: null }

export default function TileFace({ tile, facedown = false }) {
  const svg = useMemo(
    () => tileToSvg(facedown ? 'back' : tile, facedown ? BACK_OPTS : FACE_OPTS),
    [tile, facedown]
  )
  return (
    <Box
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }}
      sx={{ width: '100%', height: '100%', display: 'flex' }}
    />
  )
}
