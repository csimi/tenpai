import { Box, Paper, Typography, Button, Stack, Chip, IconButton, Tooltip } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import Chat from './Chat.jsx'
import ConnectionStatus from './ConnectionStatus.jsx'

export default function Lobby({ roomId, roster, isHost, canStart, onStart, chat, onSend, status, net }) {
  const slots = [0, 1, 2, 3]
  const copy = () => navigator.clipboard?.writeText(roomId)

  const waitingText = !net || net.relayTotal === 0
    ? 'Connecting to matchmaking…'
    : net.relayOpen === 0
      ? 'No matchmaking relay reachable yet — retrying…'
      : net.peers === 0
        ? 'Connected to relays. Searching for the host…'
        : 'Found other players. Waiting for the host to start…'

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ p: 3, width: 'min(560px, 95vw)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Lobby</Typography>
          {net && <ConnectionStatus net={net} />}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ color: '#cdbf94' }}>Room code:</Typography>
          <Chip label={roomId} sx={{ fontWeight: 700, fontSize: 16 }} />
          <Tooltip title="Copy">
            <IconButton size="small" onClick={copy}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>

        <Typography variant="body2" sx={{ mb: 1, color: '#cdbf94' }}>
          Players ({roster.length}/4)
        </Typography>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {slots.map((seat) => {
            const player = roster[seat]
            return (
              <Paper key={seat} variant="outlined" sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 1, opacity: player ? 1 : 0.4 }}>
                <Chip size="small" label={seat === 0 ? 'Host' : `P${seat + 1}`} color={seat === 0 ? 'primary' : 'default'} />
                <Typography>{player ? player.name : 'Waiting…'}</Typography>
              </Paper>
            )
          })}
        </Stack>

        {isHost ? (
          <Button fullWidth variant="contained" size="large" disabled={!canStart} onClick={onStart}>
            {canStart ? 'Start game' : `Need ${4 - roster.length} more player(s)`}
          </Button>
        ) : (
          <Typography variant="body2" sx={{ textAlign: 'center', color: '#cdbf94', mb: 1 }}>
            {status === 'connecting' ? waitingText : 'Waiting for host to start…'}
          </Typography>
        )}

        <Box sx={{ mt: 2 }}>
          <Chat chat={chat} onSend={onSend} height={160} />
        </Box>
      </Paper>
    </Box>
  )
}
