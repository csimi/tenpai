import { Box } from '@mui/material'
import Tile from './Tile.jsx'
import { Melds, SeatTag } from './Pieces.jsx'

// One opponent's edge region: name tag, concealed hand (face down), and called
// melds. Discards live in the center pond cluster (see CenterTable), not here.
//
// Layout follows the player's own point of view (they all face the center):
//   - the name tag is on their LEFT
//   - the called melds are on their RIGHT
// which maps to different screen edges per seat:
//   top    -> [melds] [hand] [tag]   (row)
//   left   -> [tag] / [hand] / [melds]   (column, top->bottom)
//   right  -> [melds] / [hand] / [tag]   (column, top->bottom)

const HAND_SIZE = 'lg'
const MELD_SIZE = 'lg'

export default function PlayerArea({ view, seat, orientation = 'top', emote }) {
  const side = orientation === 'left' || orientation === 'right'
  const handData = view.hands ? view.hands[seat] : 0
  const handCount = typeof handData === 'number' ? handData : handData.length

  const tag = (
    <SeatTag
      seat={seat}
      name={view.players[seat]?.name || `Seat ${seat}`}
      isDealer={seat === view.dealer}
      isTurn={seat === view.turn && view.phase === 'playing'}
      inRiichi={view.riichi[seat]}
      dealer={view.dealer}
      showScore={false}
      emote={emote}
      emoteDir={{ top: 'down', left: 'right', right: 'left' }[orientation]}
      timer={view.timer?.[seat] || null}
    />
  )
  // A concealed hand holds the freshly drawn tile only on its own discard turn;
  // reserve that extra slot (hidden) the rest of the time so the hand doesn't
  // shrink/grow by one tile — and rescale the whole table — as the turn passes.
  // The drawn tile sits on the player's right, which is the flex's start edge for
  // the top/right seats (where the melds sit) and its end edge for the left seat.
  const holdsDraw = seat === view.turn && view.state === 'discard'
  const slots = handCount - (holdsDraw ? 1 : 0) + 1
  const reserveAtStart = orientation === 'top' || orientation === 'right'
  const hand = (
    <Box sx={{ display: 'flex', flexDirection: side ? 'column' : 'row', gap: '1px' }}>
      {Array.from({ length: slots }).map((_, idx) => {
        const visible = reserveAtStart ? idx >= slots - handCount : idx < handCount
        return (
          <Box key={idx} sx={{ display: 'flex', visibility: visible ? 'visible' : 'hidden' }}>
            <Tile facedown size={HAND_SIZE} rotated={side} />
          </Box>
        )
      })}
    </Box>
  )
  const meldOrient = { top: 180, left: 90, right: 270 }[orientation]
  const melds = <Melds melds={view.melds[seat]} orient={meldOrient} size={MELD_SIZE} />

  // Order children so tag is on the player's left, melds on their right.
  const order = {
    top: [melds, hand, tag],
    left: [tag, hand, melds],
    right: [melds, hand, tag]
  }[orientation]

  return (
    <Box sx={{ display: 'flex', flexDirection: side ? 'column' : 'row', alignItems: 'center', gap: 1 }}>
      {order.map((node, idx) => <Box key={idx} sx={{ display: 'flex' }}>{node}</Box>)}
    </Box>
  )
}
