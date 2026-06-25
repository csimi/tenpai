import { useState, useRef, useEffect } from 'react'
import { Box, TextField, IconButton, Paper, Typography } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'

export default function Chat({ chat, onSend, height = 200 }) {
  const [text, setText] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  const submit = (event) => {
    event.preventDefault()
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  return (
    <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height }}>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
        {chat.length === 0 && (
          <Typography variant="caption" sx={{ color: '#8a9' }}>No messages yet.</Typography>
        )}
        {chat.map((entry, idx) => (
          <Typography key={idx} variant="body2" sx={{ mb: 0.3 }}>
            <Box component="span" sx={{ color: '#e0b343', fontWeight: 600, display: 'inline-block', verticalAlign: 'bottom', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.from}</Box>:{' '}
            {entry.text}
          </Typography>
        ))}
        <div ref={endRef} />
      </Box>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', p: 0.5, gap: 0.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <TextField
          size="small" fullWidth placeholder="Message…"
          value={text} onChange={(event) => setText(event.target.value)}
        />
        <IconButton type="submit" color="primary"><SendIcon /></IconButton>
      </Box>
    </Paper>
  )
}
