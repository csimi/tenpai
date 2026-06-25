import { useState, useRef, useEffect } from 'react'
import { Box } from '@mui/material'
import Tile from './Tile.jsx'
import { sortTiles, removeOne } from '../game/tiles.js'

// The local player's concealed hand. The freshly drawn tile is split off to the
// right. Discarding is two-step: the first click raises the tile, a second
// click on the same tile commits the discard, and clicking anywhere else (or a
// different tile) puts it back down.
export default function Hand({ tiles, drawnTile, onDiscard, riichiMode, riichiTiles, alreadyRiichi, yourTurn }) {
  const [selectedKey, setSelectedKey] = useState(null)
  const containerRef = useRef(null)

  // Drop any raised tile when it's no longer our decision (new draw, turn ends,
  // or riichi mode toggles).
  useEffect(() => { setSelectedKey(null) }, [yourTurn, drawnTile, riichiMode])

  // Click-away: a click outside the hand puts the raised tile back.
  useEffect(() => {
    if (selectedKey === null) return undefined
    const onDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setSelectedKey(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selectedKey])

  let resting = sortTiles(tiles)
  let drawn = null
  if (drawnTile) {
    resting = removeOne(resting, drawnTile)
    drawn = drawnTile
  }

  const canDiscard = (tile, key) => {
    if (!yourTurn) return false
    if (riichiMode) return riichiTiles?.includes(tile)
    // Once in riichi the hand is locked: only the drawn tile (its own slot) may
    // go. Match by slot, not kind — a resting tile of the same kind isn't the draw.
    if (alreadyRiichi) return key === 'drawn'
    return true
  }

  const handleClick = (tile, key) => {
    if (selectedKey === key) {
      setSelectedKey(null)
      onDiscard(tile) // second click on the same tile = commit
    } else {
      setSelectedKey(key) // first click = raise it
    }
  }

  const renderTile = (tile, key) => (
    <Tile
      key={key}
      tile={tile}
      size="xl"
      onClick={canDiscard(tile, key) ? () => handleClick(tile, key) : undefined}
      disabled={!canDiscard(tile, key)}
      selected={selectedKey === key}
      highlight={riichiMode && riichiTiles?.includes(tile)}
      dim={(riichiMode || alreadyRiichi) && !canDiscard(tile, key)}
      noMatchHighlight
    />
  )

  return (
    <Box ref={containerRef} sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {resting.map((tile, idx) => renderTile(tile, idx))}
      </Box>
      {drawn ? (
        <Box sx={{ ml: 1.5 }}>
          {renderTile(drawn, 'drawn')}
        </Box>
      ) : (
        // Reserve the drawn-tile slot off-turn so the hand keeps the same width
        // whether or not you're holding a draw (no shift when the turn passes).
        <Box sx={{ ml: 1.5, visibility: 'hidden' }} aria-hidden>
          <Tile size="xl" facedown />
        </Box>
      )}
    </Box>
  )
}
