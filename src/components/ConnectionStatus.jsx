import { Box, Tooltip, Typography } from '@mui/material'

// Compact P2P status: a colored dot + short label, derived from relay health
// and connected player count.
export default function ConnectionStatus({ net, inGame = false }) {
  const { peers, relayOpen, relayTotal } = net
  // `peers` excludes this client; the human player count includes you (bots fill
  // the remaining seats and aren't peers).
  const players = peers + 1

  let color = '#9e9e9e'
  let label = 'Starting…'
  let detail = 'Initializing matchmaking.'

  if (inGame) {
    // Mid-game, relay/matchmaking status is moot — a solo game filled with bots
    // simply has no peers. Show a healthy state and the human head-count.
    color = '#66bb6a'
    label = players === 1 ? 'Playing' : `${players} players`
    detail = players === 1 ? 'Game in progress (solo with bots).' : `${players} players connected.`
  } else if (relayTotal === 0) {
    color = '#9e9e9e'; label = 'Starting…'
  } else if (relayOpen === 0) {
    color = '#ef5350'; label = 'No relay'
    detail = 'No matchmaking relay reachable. Players can only connect once a relay is up.'
  } else if (peers === 0) {
    color = '#ffb300'; label = 'Searching'
    detail = `Connected to ${relayOpen}/${relayTotal} relays. Waiting for other players to join the room.`
  } else {
    color = '#66bb6a'; label = `${players} player${players === 1 ? '' : 's'}`
    detail = `${players} player(s) connected via ${relayOpen}/${relayTotal} relays.`
  }

  return (
    <Tooltip title={detail}>
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 6px ${color}` }} />
        <Typography variant="caption" sx={{ color: '#cdbf94' }}>{label}</Typography>
      </Box>
    </Tooltip>
  )
}
