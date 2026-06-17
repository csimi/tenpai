import { useEffect, useState } from 'react'
import { Box, Typography, Chip, Tooltip } from '@mui/material'
import Tile, { SIZES } from './Tile.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import { doraFromIndicator } from '../game/tiles.js'
import { SIDEBAR_MQ } from './layout.js'

// Countdown pill for a seat that's on the turn clock. `remaining` is the seat's
// whole budget (base + reserve) left when the latest view arrived; `bank` is the
// reserve part. We tick down locally so it stays smooth between broadcasts, and
// show the base counting down first (green), then the reserve (amber), red in the
// last few seconds. Mounted with a per-decision `key` so each move resets it.
export function TurnTimer({ remaining, bank }) {
  const [left, setLeft] = useState(remaining)
  useEffect(() => {
    setLeft(remaining)
    const start = Date.now()
    const id = setInterval(() => {
      const next = remaining - (Date.now() - start) / 1000
      setLeft(next > 0 ? next : 0)
    }, 250)
    return () => clearInterval(id)
  }, [remaining])
  // Above the reserve we're still on base time; show the base part draining, then
  // hand over to the reserve number once base is gone. Normal time stays amber the
  // whole way down; only the reserve burning down goes red.
  const inReserve = bank > 0 && left <= bank
  const shown = inReserve ? left : left - bank
  const color = inReserve ? '#ff5252' : '#e0b343'
  return (
    <Box
      sx={{
        display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', gap: 0.25,
        minWidth: 24, px: 0.5, py: 0.25, borderRadius: 1, lineHeight: 1.2,
        color: '#1a1a1a', background: color, fontVariantNumeric: 'tabular-nums'
      }}
    >
      <Box component="span" sx={{ fontWeight: 700, fontSize: 13 }}>{Math.ceil(shown)}</Box>
      {/* While on base time, show the reserve waiting behind it (+N). In the
          reserve the main number already is what's left, so drop the suffix. */}
      {bank > 0 && !inReserve && (
        <Box component="span" sx={{ fontSize: 9, fontWeight: 700, opacity: 0.75 }}>+{Math.ceil(bank)}</Box>
      )}
    </Box>
  )
}

const WIND_LABEL = { '1z': 'E', '2z': 'S', '3z': 'W', '4z': 'N' }
const seatWindKind = (seat, dealer) => ['1z', '2z', '3z', '4z'][(seat - dealer + 4) % 4]

// A player's discard pond, drawn from that player's point of view: `orient` is
// the seat's base rotation in degrees (0 self, 180 across, 90 left, 270 right).
// Each pond reads 6-per-row from the player's left to right, with new rows added
// toward that player — i.e. the bottom seat's pond rotated by `orient`. Tiles are
// placed explicitly (rather than auto-flowed) so the row direction is right for
// every seat. A riichi tile is turned a further 90° (sideways) and the most
// recent discard is highlighted.
export function Discards({ discards, lastIndex, orient = 0, size = 'sm' }) {
  const tall = orient === 90 || orient === 270
  const rows = Math.max(1, Math.ceil(discards.length / 6))
  // Reserve a stable 6-wide × 3-deep footprint so the pond keeps the same size
  // (and the whole table keeps the same scale) as discards accumulate, instead
  // of growing tile-by-tile. minmax holds empty tracks at their natural tile
  // size while still letting a sideways riichi tile expand its own track.
  const { w: tileW, h: tileH } = SIZES[size] || SIZES.sm
  // Always reserve at least 3 rows deep so the pond keeps a stable footprint; the
  // placement below must use this same depth, not the raw `rows`, so the rows that
  // grow away from the player still anchor against the center square.
  const depth = Math.max(3, rows)
  const along = `repeat(6, minmax(${tileW}, auto))`
  const across = `repeat(${depth}, minmax(${tileH}, auto))`
  // Map a discard index to a 1-based grid cell. `pos` runs along a row (the
  // player's left→right); `row` is which row (0 = first, furthest from player).
  const placeAt = (idx) => {
    const pos = idx % 6
    const row = Math.floor(idx / 6)
    switch (orient) {
      case 90: return { gridColumn: depth - row, gridRow: pos + 1 }   // left
      case 180: return { gridColumn: 6 - pos, gridRow: depth - row }  // across
      case 270: return { gridColumn: row + 1, gridRow: 6 - pos }      // right
      default: return { gridColumn: pos + 1, gridRow: row + 1 }       // self
    }
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: tall ? across : along,
        gridTemplateRows: tall ? along : across,
        gap: '2px',
        justifyContent: 'start',
        alignContent: 'start'
      }}
    >
      {discards.map((entry, idx) => (
        <Box key={idx} sx={{ ...placeAt(idx), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Tile
            tile={entry.tile}
            size={size}
            orient={orient + (entry.riichi ? 90 : 0)}
            dim={entry.called}
            highlight={idx === lastIndex}
          />
        </Box>
      ))}
    </Box>
  )
}

// Render a player's called melds from that player's point of view. `orient` is
// the seat's base rotation in degrees (0 self, 180 across, 90 left, 270 right);
// the left/right seats stack their melds in a column so each meld reads down the
// edge. The called tile is turned a further 90° (perpendicular) to the rest.
export function Melds({ melds, orient = 0, size = 'sm' }) {
  if (!melds || melds.length === 0) return null
  const vertical = orient === 90 || orient === 270
  // The rotated called tile is shorter on the cross axis; rest it against the
  // player's outer screen edge (bottom seat → bottom, right seat → right) so the
  // meld sits flush there instead of floating off the edge.
  const edge = orient === 0 || orient === 270 ? 'flex-end' : 'flex-start'
  return (
    <Box sx={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: edge, gap: 0.75, flexWrap: 'wrap' }}>
      {melds.map((meld, idx) => (
        <Box key={idx} sx={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: edge, gap: '1px' }}>
          {meld.tiles.map((tile, tileIdx) => {
            const called = !meld.concealed && tileIdx === 0
            return (
              <Tile
                key={tileIdx}
                tile={tile}
                size={size}
                facedown={meld.type === 'kan' && meld.concealed && (tileIdx === 0 || tileIdx === 3)}
                orient={orient + (called ? 90 : 0)}
              />
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

// Dora indicator strip. Each indicator is shown next to the tile it actually
// makes a bonus (indicator -> dora), since the mapping isn't obvious for winds
// and dragons (they cycle within their own group, not 1->2->3...).
export function DoraIndicators({ indicators }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 0.5,
      // In the narrow landscape sidebar the pairs don't fit side by side, so
      // give each indicator -> dora pair its own line.
      [SIDEBAR_MQ]: { flexDirection: 'column', alignItems: 'flex-start' }
    }}>
      <Typography variant="caption" sx={{ color: '#cdbf94', mr: 0.5 }}>Dora</Typography>
      {indicators.map((tile, idx) => (
        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Tile tile={tile} size="sm" />
          <Typography variant="caption" sx={{ color: '#8aa' }}>→</Typography>
          <Tile tile={doraFromIndicator(tile)} size="sm" highlight />
        </Box>
      ))}
    </Box>
  )
}

// Compact dora reveal (indicator -> actual dora) used in the result dialog.
export function DoraReveal({ label, indicators }) {
  if (!indicators || indicators.length === 0) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', my: 0.5 }}>
      <Typography variant="caption" sx={{ color: '#cdbf94', minWidth: 70 }}>{label}</Typography>
      {indicators.map((tile, idx) => (
        <Box
          key={idx}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.25,
            px: 0.75, py: 0.25, borderRadius: 1,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(0,0,0,0.2)'
          }}
        >
          <Tile tile={tile} size="sm" />
          <Typography variant="caption" sx={{ color: '#8aa' }}>→</Typography>
          <Tile tile={doraFromIndicator(tile)} size="sm" highlight />
        </Box>
      ))}
    </Box>
  )
}

// Direction an emote drifts as it fades (toward the table center).
const EMOTE_DIRS = {
  up: { pos: { bottom: '100%', left: '50%' }, base: 'translateX(-50%)', axis: 'Y', sign: -1 },
  down: { pos: { top: '100%', left: '50%' }, base: 'translateX(-50%)', axis: 'Y', sign: 1 },
  right: { pos: { left: '100%', top: '50%' }, base: 'translateY(-50%)', axis: 'X', sign: 1 },
  left: { pos: { right: '100%', top: '50%' }, base: 'translateY(-50%)', axis: 'X', sign: -1 }
}
function emoteSx(direction) {
  const dir = EMOTE_DIRS[direction] || EMOTE_DIRS.up
  const at = (value) => `${dir.base} translate${dir.axis}(${dir.sign * value}px)`
  const name = `emote_${direction}`
  return {
    position: 'absolute',
    ...dir.pos,
    fontSize: 32,
    pointerEvents: 'none',
    zIndex: 10,
    animation: `${name} 5s ease-out forwards`,
    [`@keyframes ${name}`]: {
      '0%': { opacity: 0, transform: `${at(-6)} scale(0.4)` },
      '15%': { opacity: 1, transform: `${at(8)} scale(1.15)` },
      '30%': { transform: `${at(18)} scale(1)` },
      '80%': { opacity: 1, transform: `${at(48)} scale(1)` },
      '100%': { opacity: 0, transform: `${at(70)} scale(1)` }
    }
  }
}

// Seat header: wind, name, score, dealer/turn/riichi markers. `emote` is a
// transient { emoji, id } reaction that drifts from the tag toward the center
// (per `emoteDir`) and fades.
export function SeatTag({ seat, name, score, isDealer, isTurn, inRiichi, dealer, scoreDelta, showScore = true, emote, emoteDir = 'up', onEmote, waits, timer }) {
  // The riichi stick; for your own seat (`waits` provided) hovering it reveals
  // what you're waiting on. Opponents' tags pass no waits, so nothing leaks.
  const stick = (
    <Box sx={{ width: 26, height: 6, borderRadius: 3, bgcolor: '#fff', position: 'relative' }}>
      <Box sx={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 6, borderRadius: '50%', bgcolor: '#d33', transform: 'translate(-50%, -50%)' }} />
    </Box>
  )
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        background: isTurn ? 'rgba(224,179,67,0.22)' : 'rgba(0,0,0,0.25)',
        border: isTurn ? '1px solid #e0b343' : '1px solid transparent'
      }}
    >
      {emote && (
        <Box key={emote.id} sx={emoteSx(emoteDir)}>
          {emote.emoji}
        </Box>
      )}
      {onEmote && <EmojiPicker onPick={onEmote} />}
      <Chip
        size="small"
        label={WIND_LABEL[seatWindKind(seat, dealer)]}
        sx={{
          height: 22, fontWeight: 700,
          bgcolor: isDealer ? '#e0b343' : '#37503f',
          color: isDealer ? '#1a1a1a' : '#fff'
        }}
      />
      {timer && <TurnTimer key={timer.token} remaining={timer.remaining} bank={timer.bank} />}
      {(name || showScore) && (
        <Box sx={{ minWidth: 0 }}>
          {name && (
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 120 }}>
              {name}
            </Typography>
          )}
          {showScore && (
            <Typography variant="caption" sx={{ color: '#cdbf94' }}>
              {score.toLocaleString()}
              {typeof scoreDelta === 'number' && scoreDelta !== 0 && (
                <Box component="span" sx={{ ml: 0.5, color: scoreDelta > 0 ? '#7CFC9A' : '#ff8a80' }}>
                  {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                </Box>
              )}
            </Typography>
          )}
        </Box>
      )}
      {inRiichi && (waits && waits.length > 0 ? (
        <Tooltip
          arrow
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.25 }}>
              <Typography variant="caption" sx={{ color: '#cdbf94' }}>Waiting</Typography>
              {waits.map((wait, idx) => <Tile key={idx} tile={wait} size="sm" />)}
            </Box>
          }
        >
          <Box sx={{ display: 'inline-flex', cursor: 'help' }}>{stick}</Box>
        </Tooltip>
      ) : stick)}
    </Box>
  )
}
