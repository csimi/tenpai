import { useId } from 'react'
import { Box, Tooltip } from '@mui/material'
import { tileLabel } from 'tilekit'
import TileFace from './TileFace.jsx'
import { useTileHover } from './tileHover.js'

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// A single tile: an ivory body with a drawn face (see TileFace). Supports
// face-down, selected (raised), highlighted, dimmed, and rotated (for riichi
// discards and called melds) presentations.
//
// Sizes are responsive: they scale with the viewport (vmin) between a min and a
// max via clamp(), keeping the ~5:7 tile aspect ratio. Because dimensions are
// CSS expressions (not numbers), the rotated-face centering is done with
// calc() rather than JS arithmetic.
export const SIZES = {
  sm: { w: 'clamp(16px, 2.4vmin, 28px)', h: 'clamp(22px, 3.4vmin, 39px)' }, // melds, opponent hands
  md: { w: 'clamp(24px, 3.7vmin, 40px)', h: 'clamp(34px, 5.2vmin, 56px)' }, // dora
  lg: { w: 'clamp(33px, 5.1vmin, 56px)', h: 'clamp(46px, 7.2vmin, 78px)' } //  the local player's hand, discards
}

export default function Tile({
  tile,
  onClick,
  selected = false,
  disabled = false,
  size = 'md',
  facedown = false,
  highlight = false,
  rotated = false,
  orient = null,
  dim = false,
  noMatchHighlight = false,
  noHover = false
}) {
  const dims = SIZES[size] || SIZES.md
  // `orient` is the face rotation in degrees (0/90/180/270) so a tile can be
  // drawn from each seat's point of view; `rotated` is the legacy boolean
  // shorthand for 90°. 90° and 270° put the tile on its side (landscape body).
  const rotation = ((orient ?? (rotated ? 90 : 0)) % 360 + 360) % 360
  const landscape = rotation === 90 || rotation === 270
  const bodyW = landscape ? dims.h : dims.w
  const bodyH = landscape ? dims.w : dims.h
  // The body is border-box with a 1px face-up border. The face is absolutely
  // positioned, so its containing block is the body's padding box (already inside
  // that border). Shrink the face to that inner box and center it against the
  // padding box — both dims drop the 2px border so the face fits exactly and
  // stays centered (also when the body is landscape from rotation). Face-down has
  // no border, so its back fills edge to edge.
  const inset = facedown ? '0px' : '2px'
  const faceW = `calc(${dims.w} - ${inset})`
  const faceH = `calc(${dims.h} - ${inset})`
  const innerW = `calc(${bodyW} - ${inset})`
  const innerH = `calc(${bodyH} - ${inset})`
  const clickable = !!onClick && !disabled

  const hover = useTileHover()
  const tileId = useId()
  // Highlight other visible copies of the hovered kind — but not tiles in the
  // player's own hand (noMatchHighlight) nor the exact tile being hovered
  // (matched by identity, so there's no frame-gap flicker on mouse-out).
  const matched = !!hover && !facedown && !noMatchHighlight && !noHover &&
    hover.hovered?.kind === tile && hover.hovered?.id !== tileId

  // Face-down tiles have no known kind, so they never participate in the
  // tiles-remaining hover (their `tile` prop is usually undefined). `noHover`
  // opts a tile out entirely (e.g. a decorative example shown inside a game).
  const interactive = !!hover && !facedown && !noHover

  const body = (
    <Box
      onClick={clickable ? () => onClick(tile) : undefined}
      onMouseEnter={interactive ? () => hover.setHovered({ kind: tile, id: tileId }) : undefined}
      onMouseLeave={interactive ? () => hover.setHovered(null) : undefined}
      sx={{
        position: 'relative',
        width: bodyW,
        height: bodyH,
        flexShrink: 0,
        borderRadius: 1,
        // Face-down: the opaque green back from tilekit is the body, so the
        // ivory fill and tan border are dropped. The body is filled with the
        // back's base green (tilekit's default backColor) so the tile reads
        // edge-to-edge even where the SVG letterboxes slightly.
        background: facedown ? '#6f9b3e' : (dim ? '#d8d2c4' : 'linear-gradient(#fffef9, #ece6d6)'),
        border: facedown ? 'none' : '1px solid #b6ad97',
        boxShadow: selected
          ? '0 -6px 0 -1px #e0b343, 0 2px 4px rgba(0,0,0,0.4)'
          : '0 2px 3px rgba(0,0,0,0.4)',
        // Highlight/match rings use outline (drawn over the body, no layout
        // impact) so toggling them never nudges the absolutely-positioned face.
        outline: matched ? '3px solid #29b6f6' : (highlight ? '2px solid #e0b343' : 'none'),
        outlineOffset: '-1px',
        zIndex: matched ? 3 : 'auto',
        transform: selected ? 'translateY(-22%)' : 'none',
        transition: 'transform 0.12s',
        cursor: clickable ? 'pointer' : 'default',
        opacity: dim ? 0.6 : 1,
        userSelect: 'none',
        '&:hover': clickable ? { borderColor: '#e0b343' } : {}
      }}
    >
      {/* Portrait face, centered in the (possibly rotated) body via calc().
          pointerEvents none keeps the body Box the hit target: Safari treats the
          injected <svg> as the click target and doesn't bubble a click from it to
          React's delegated onClick, so taps over the face would otherwise do
          nothing. Routing all pointer events to the body fixes click and hover. */}
      <Box
        sx={{
          position: 'absolute',
          width: faceW,
          height: faceH,
          left: `calc((${innerW} - ${faceW}) / 2)`,
          top: `calc((${innerH} - ${faceH}) / 2)`,
          transform: rotation ? `rotate(${rotation}deg)` : 'none',
          transformOrigin: 'center',
          display: 'flex',
          pointerEvents: 'none'
        }}
      >
        <TileFace tile={tile} facedown={facedown} />
      </Box>
    </Box>
  )

  if (!interactive) return body
  const { remaining, visible } = hover.infoFor(tile)
  // Drive the tooltip's open state from the shared hover state (instead of MUI's
  // own internal hover) so it can't get "stuck": when a hovered tile is removed
  // or re-rendered (after a discard/draw/call), clearing the shared state closes
  // it. Only one tile matches `hovered.id` at a time, so only one tooltip shows.
  return (
    <Tooltip
      arrow
      disableInteractive
      open={hover.hovered?.id === tileId}
      title={
        <Box sx={{ textAlign: 'center', lineHeight: 1.4 }}>
          <div>{remaining} left to draw · {visible} seen</div>
          <div style={{ opacity: 0.85 }}>{capitalize(tileLabel(tile))}</div>
        </Box>
      }
    >
      {body}
    </Tooltip>
  )
}
