import { useState } from 'react'
import { IconButton, Popover, Box, Tooltip } from '@mui/material'
import MoodIcon from '@mui/icons-material/Mood'

// Mahjong-flavored reactions: happy, nervous, smug/mocking, thinking, shocked,
// sad, crying, angry, dead, celebrate, clap, begging-for-the-tile, etc.
const EMOJIS = ['😀', '😅', '😎', '😏', '🤔', '😮', '😱', '😭', '😢', '😡', '💀', '🥵', '🎉', '👏', '🙏', '🤯']

export default function EmojiPicker({ onPick }) {
  const [anchor, setAnchor] = useState(null)

  const pick = (emoji) => {
    onPick(emoji)
    setAnchor(null)
  }

  return (
    <>
      <Tooltip title="Send a reaction">
        <IconButton color="primary" size="small" onClick={(event) => setAnchor(event.currentTarget)}>
          <MoodIcon />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, auto)', gap: 0.25, p: 1 }}>
          {EMOJIS.map((emoji) => (
            <Box
              key={emoji}
              component="button"
              onClick={() => pick(emoji)}
              sx={{
                fontSize: 24, lineHeight: 1, p: 0.5, cursor: 'pointer',
                border: 'none', background: 'none', borderRadius: 1,
                '&:hover': { background: 'rgba(255,255,255,0.12)' }
              }}
            >
              {emoji}
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  )
}
