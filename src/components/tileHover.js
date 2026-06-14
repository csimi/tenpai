import { createContext, useContext } from 'react'

// Shared hover state so that hovering any face-up tile can (a) show how many of
// that kind are unseen ("left to draw") and (b) highlight every visible copy on
// the table, without threading props through every component.
//
// Value: { hovered: kind|null, setHovered, infoFor(kind) -> { visible, remaining } }
export const TileHoverContext = createContext(null)
export const useTileHover = () => useContext(TileHoverContext)
