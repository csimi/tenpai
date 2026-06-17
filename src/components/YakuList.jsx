import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Tabs, Tab, Box, Typography, Chip, Stack, Collapse
} from '@mui/material'
import Tile from './Tile.jsx'

// A reference of every yaku the engine scores, split into pages by how soon a
// player tends to meet them. Han is written closed/open where it differs (a
// single number means it's the same either way); "closed" marks yaku that need a
// fully concealed hand. Descriptions are kept short — this is a quick reminder,
// not the full rulebook. `example` is one complete winning hand that shows the
// pattern, revealed on hover; situational yaku (riichi, ippatsu, last-tile wins,
// …) shape no particular hand, so they carry none.
const PAGES = [
  {
    label: 'Basics',
    yaku: [
      { name: 'Riichi', han: '1', tag: 'closed', desc: 'Declare on a closed tenpai hand. A 1,000-point bet that counts as a yaku by itself.' },
      { name: 'Menzen Tsumo', han: '1', tag: 'closed', desc: 'Self-draw the winning tile with a fully concealed hand.' },
      { name: 'Tanyao — all simples', han: '1', desc: 'Every tile is a 2–8 number tile: no terminals (1/9) and no honors. Works with an open hand.',
        example: ['2m', '3m', '4m', '5m', '6m', '7m', '8p', '8p', '8p', '6s', '7s', '8s', '3s', '3s'] },
      { name: 'Yakuhai — value triplet', han: '1 each', desc: 'A triplet of any dragon, or of your seat wind or the round wind.',
        example: ['5z', '5z', '5z', '2m', '3m', '4m', '6m', '7m', '8m', '3p', '4p', '5p', '9s', '9s'] },
      { name: 'Pinfu', han: '1', tag: 'closed', desc: 'Four sequences and a valueless pair, won on a two-sided wait.',
        example: ['2m', '3m', '4m', '1p', '2p', '3p', '3m', '4m', '5m', '6s', '7s', '8s', '5p', '5p'] },
      { name: 'Iipeikou', han: '1', tag: 'closed', desc: 'Two identical sequences — same suit, same numbers.',
        example: ['2p', '3p', '4p', '2p', '3p', '4p', '7m', '7m', '7m', '6s', '7s', '8s', '3m', '3m'] },
      { name: 'Dora & red fives', han: '+1 each', desc: 'Not a yaku, but each dora or red five adds a han once you already have a yaku.',
        example: ['4m', '0m', '6m', '4p', '0p', '6p', '4s', '0s', '6s', '7m', '8m', '9m', '9p', '9p'] }
    ]
  },
  {
    label: 'Common',
    yaku: [
      { name: 'Double Riichi', han: '2', tag: 'closed', desc: 'Riichi declared on your very first discard, with no calls before it.' },
      { name: 'Ippatsu', han: '1', tag: 'closed', desc: 'Win within one go-around of declaring riichi, with no calls in between.' },
      { name: 'Sanshoku Doujun', han: '2 / 1', desc: 'The same sequence in all three suits at once.',
        example: ['3m', '4m', '5m', '3p', '4p', '5p', '3s', '4s', '5s', '9m', '9m', '9m', '7p', '7p'] },
      { name: 'Ittsuu — pure straight', han: '2 / 1', desc: 'The 1–9 run (123-456-789) all in one suit.',
        example: ['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '7m', '7m', '7m', '5s', '5s'] },
      { name: 'Chiitoitsu', han: '2', tag: 'closed', desc: 'Seven different pairs instead of the usual four sets and a pair.',
        example: ['1m', '1m', '4m', '4m', '2p', '2p', '7p', '7p', '3s', '3s', '5z', '5z', '2z', '2z'] },
      { name: 'Toitoi', han: '2', desc: 'All four sets are triplets or kans — no sequences.',
        example: ['2m', '2m', '2m', '5p', '5p', '5p', '8s', '8s', '8s', '3z', '3z', '3z', '9m', '9m'] },
      { name: 'Chanta', han: '2 / 1', desc: 'Every set and the pair contains a terminal or an honor.',
        example: ['1m', '2m', '3m', '7p', '8p', '9p', '1s', '2s', '3s', '9m', '9m', '9m', '1z', '1z'] },
      { name: 'Haitei / Houtei', han: '1', desc: 'Win on the very last tile drawn (haitei) or the last discard (houtei).' },
      { name: 'Rinshan Kaihou', han: '1', desc: 'Win on the replacement tile drawn after declaring a kan.' },
      { name: 'Chankan', han: '1', desc: 'Ron on the tile a player adds to their open pon to make a kan.' }
    ]
  },
  {
    label: 'Advanced',
    yaku: [
      { name: 'Sanankou', han: '2', desc: 'Three concealed triplets.',
        example: ['2m', '2m', '2m', '5p', '5p', '5p', '8s', '8s', '8s', '3m', '4m', '5m', '9p', '9p'] },
      { name: 'Sankantsu', han: '2', desc: 'Three kans.',
        example: ['1m', '1m', '1m', '1m', '5p', '5p', '5p', '5p', '9s', '9s', '9s', '9s', '2m', '3m', '4m', '7p', '7p'] },
      { name: 'Sanshoku Doukou', han: '2', desc: 'The same triplet in all three suits.',
        example: ['3m', '3m', '3m', '3p', '3p', '3p', '3s', '3s', '3s', '6m', '7m', '8m', '9p', '9p'] },
      { name: 'Shousangen', han: '2', desc: 'Two dragon triplets plus a pair of the third dragon (on top of the yakuhai).',
        example: ['5z', '5z', '5z', '6z', '6z', '6z', '7z', '7z', '2m', '3m', '4m', '6p', '7p', '8p'] },
      { name: 'Honroutou', han: '2', desc: 'Only terminals and honors — no simples at all.',
        example: ['1m', '1m', '1m', '9p', '9p', '9p', '1s', '1s', '1s', '5z', '5z', '5z', '7z', '7z'] },
      { name: 'Junchan', han: '3 / 2', desc: 'Every set and the pair contains a terminal — and no honors.',
        example: ['1m', '2m', '3m', '7p', '8p', '9p', '1s', '2s', '3s', '9m', '9m', '9m', '1p', '1p'] },
      { name: 'Honitsu', han: '3 / 2', desc: 'A single suit plus honor tiles.',
        example: ['1p', '2p', '3p', '5p', '6p', '7p', '9p', '9p', '9p', '5z', '5z', '5z', '7z', '7z'] },
      { name: 'Ryanpeikou', han: '3', tag: 'closed', desc: 'Two separate pairs of identical sequences.',
        example: ['2m', '3m', '4m', '2m', '3m', '4m', '6p', '7p', '8p', '6p', '7p', '8p', '9s', '9s'] },
      { name: 'Chinitsu', han: '6 / 5', desc: 'A single suit with no honors at all.',
        example: ['1s', '2s', '3s', '5s', '6s', '7s', '9s', '9s', '9s', '2s', '3s', '4s', '5s', '5s'] }
    ]
  },
  {
    label: 'Yakuman',
    yaku: [
      { name: 'Kokushi Musou', han: '★', tag: 'closed', desc: 'One of each terminal and honor, plus a second copy of one of them. (13-sided wait counts double.)',
        example: ['1m', '9m', '1p', '9p', '1s', '9s', '1z', '2z', '3z', '4z', '5z', '6z', '7z', '1m'] },
      { name: 'Suuankou', han: '★', tag: 'closed', desc: 'Four concealed triplets. (A single-tile pair wait counts double.)',
        example: ['2m', '2m', '2m', '5p', '5p', '5p', '8s', '8s', '8s', '3z', '3z', '3z', '9m', '9m'] },
      { name: 'Daisangen', han: '★', desc: 'Triplets of all three dragons.',
        example: ['5z', '5z', '5z', '6z', '6z', '6z', '7z', '7z', '7z', '2m', '3m', '4m', '9p', '9p'] },
      { name: 'Shousuushi', han: '★', desc: 'Three wind triplets plus a pair of the fourth wind.',
        example: ['1z', '1z', '1z', '2z', '2z', '2z', '3z', '3z', '3z', '4z', '4z', '5p', '6p', '7p'] },
      { name: 'Daisuushi', han: '★★', desc: 'Triplets of all four winds.',
        example: ['1z', '1z', '1z', '2z', '2z', '2z', '3z', '3z', '3z', '4z', '4z', '4z', '9m', '9m'] },
      { name: 'Tsuuiisou', han: '★', desc: 'A hand made entirely of honor tiles.',
        example: ['1z', '1z', '1z', '2z', '2z', '2z', '3z', '3z', '3z', '5z', '5z', '5z', '7z', '7z'] },
      { name: 'Chinroutou', han: '★', desc: 'A hand made entirely of terminals (1s and 9s).',
        example: ['1m', '1m', '1m', '9m', '9m', '9m', '1p', '1p', '1p', '9s', '9s', '9s', '1s', '1s'] },
      { name: 'Ryuuiisou', han: '★', desc: 'All green tiles: 2/3/4/6/8 of bamboo and the green dragon.',
        example: ['2s', '3s', '4s', '3s', '3s', '3s', '6s', '6s', '6s', '8s', '8s', '8s', '6z', '6z'] },
      { name: 'Suukantsu', han: '★', desc: 'Four kans.',
        example: ['1m', '1m', '1m', '1m', '5p', '5p', '5p', '5p', '9s', '9s', '9s', '9s', '3z', '3z', '3z', '3z', '7p', '7p'] },
      { name: 'Chuuren Poutou', han: '★', tag: 'closed', desc: 'A closed single-suit hand of 1112345678999 plus any one extra of that suit.',
        example: ['1p', '1p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '9p', '9p', '5p'] },
      { name: 'Tenhou / Chiihou', han: '★', desc: "The dealer's opening draw wins (tenhou), or a non-dealer wins on their first uninterrupted draw (chiihou)." }
    ]
  }
]

function YakuRow({ name, han, tag, desc, example }) {
  const [show, setShow] = useState(false)
  return (
    <Box
      onMouseEnter={() => example && setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => example && setShow((prev) => !prev)}
      sx={{ py: 1, borderBottom: '1px solid rgba(205,191,148,0.15)', cursor: example ? 'pointer' : 'default' }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#e0b343' }}>{name}</Typography>
        <Chip size="small" label={han} sx={{ height: 18, fontSize: 11, bgcolor: 'rgba(224,179,67,0.2)', color: '#e0b343' }} />
        {tag && <Chip size="small" label={tag} variant="outlined" sx={{ height: 18, fontSize: 11, color: '#cdbf94', borderColor: 'rgba(205,191,148,0.4)' }} />}
      </Stack>
      <Typography variant="body2" sx={{ color: '#cdbf94' }}>{desc}</Typography>
      {example && (
        <Collapse in={show} unmountOnExit>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25, mt: 0.75 }}>
            {example.map((tile, idx) => <Tile key={idx} tile={tile} size="sm" noHover />)}
          </Box>
        </Collapse>
      )}
    </Box>
  )
}

export default function YakuList({ open, onClose }) {
  const [page, setPage] = useState(0)
  const current = PAGES[page]
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>Yaku — winning patterns</DialogTitle>
      <Tabs
        value={page}
        onChange={(event, value) => setPage(value)}
        variant="fullWidth"
        sx={{ px: 2, borderBottom: '1px solid rgba(205,191,148,0.2)' }}
      >
        {PAGES.map((entry) => <Tab key={entry.label} label={entry.label} />)}
      </Tabs>
      <DialogContent>
        <Typography variant="caption" sx={{ color: '#cdbf94', display: 'block', mb: 1 }}>
          Han shown as closed / open where it differs. ★ marks a yakuman (limit hand). Hover a pattern for an example hand.
        </Typography>
        {current.yaku.map((entry) => <YakuRow key={entry.name} {...entry} />)}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
