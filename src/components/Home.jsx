import { useState } from 'react'
import {
  Box, Paper, Typography, TextField, Button, Stack, Divider, IconButton, Tooltip, InputAdornment
} from '@mui/material'
import CasinoIcon from '@mui/icons-material/Casino'

const randomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase()

export default function Home({ onEnter }) {
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState(randomCode())

  const go = () => {
    const trimmedName = name.trim() || 'Player'
    const code = roomId.trim().toUpperCase()
    if (!code) return
    onEnter({ name: trimmedName, roomId: code })
  }

  return (
    // Scroll container (the card centers but grows past a short viewport — e.g. a
    // phone in landscape — so it scrolls instead of being clipped).
    <Box sx={{ height: '100%', overflowY: 'auto' }}>
    <Box sx={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ p: 4, width: 'min(440px, 95vw)' }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color: '#e0b343', mb: 0.5 }}>
          Tenpai
        </Typography>
        <Typography variant="body2" sx={{ color: '#cdbf94', mb: 3 }}>
          Serverless 4-player mahjong. No accounts, no server.
        </Typography>

        <Stack spacing={2}>
          <TextField
            label="Your name" value={name}
            onChange={(event) => setName(event.target.value)}
            inputProps={{ maxLength: 16 }} autoFocus
          />

          <TextField
            label="Room code"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value.toUpperCase())}
            helperText="Share this code with friends, or paste one to join theirs."
            inputProps={{ maxLength: 12 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="New code">
                    <IconButton size="small" onClick={() => setRoomId(randomCode())}>
                      <CasinoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              )
            }}
          />

          <Divider />
          <Button variant="contained" size="large" onClick={go} disabled={!roomId.trim()}>
            Enter lobby
          </Button>
        </Stack>

        <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#8a9' }}>
          Everyone who enters the same code lands in the same lobby. All four players must keep this
          tab open; whoever arrives first runs the game, and if they leave the game ends.
        </Typography>
      </Paper>
    </Box>
    </Box>
  )
}
