import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Tabs, Tab, Box, Typography, Chip, Stack
} from '@mui/material'

// A reference of every yaku the engine scores, split into pages by how soon a
// player tends to meet them. Han is written closed/open where it differs (a
// single number means it's the same either way); "closed" marks yaku that need a
// fully concealed hand. Descriptions are kept short — this is a quick reminder,
// not the full rulebook.
const PAGES = [
  {
    label: 'Basics',
    yaku: [
      { name: 'Riichi', han: '1', tag: 'closed', desc: 'Declare on a closed tenpai hand. A 1,000-point bet that counts as a yaku by itself.' },
      { name: 'Menzen Tsumo', han: '1', tag: 'closed', desc: 'Self-draw the winning tile with a fully concealed hand.' },
      { name: 'Tanyao — all simples', han: '1', desc: 'Every tile is a 2–8 number tile: no terminals (1/9) and no honors. Works with an open hand.' },
      { name: 'Yakuhai — value triplet', han: '1 each', desc: 'A triplet of any dragon, or of your seat wind or the round wind.' },
      { name: 'Pinfu', han: '1', tag: 'closed', desc: 'Four sequences and a valueless pair, won on a two-sided wait.' },
      { name: 'Iipeikou', han: '1', tag: 'closed', desc: 'Two identical sequences — same suit, same numbers.' },
      { name: 'Dora & red fives', han: '+1 each', desc: 'Not a yaku, but each dora or red five adds a han once you already have a yaku.' }
    ]
  },
  {
    label: 'Common',
    yaku: [
      { name: 'Double Riichi', han: '2', tag: 'closed', desc: 'Riichi declared on your very first discard, with no calls before it.' },
      { name: 'Ippatsu', han: '1', tag: 'closed', desc: 'Win within one go-around of declaring riichi, with no calls in between.' },
      { name: 'Sanshoku Doujun', han: '2 / 1', desc: 'The same sequence in all three suits at once.' },
      { name: 'Ittsuu — pure straight', han: '2 / 1', desc: 'The 1–9 run (123-456-789) all in one suit.' },
      { name: 'Chiitoitsu', han: '2', tag: 'closed', desc: 'Seven different pairs instead of the usual four sets and a pair.' },
      { name: 'Toitoi', han: '2', desc: 'All four sets are triplets or kans — no sequences.' },
      { name: 'Chanta', han: '2 / 1', desc: 'Every set and the pair contains a terminal or an honor.' },
      { name: 'Haitei / Houtei', han: '1', desc: 'Win on the very last tile drawn (haitei) or the last discard (houtei).' },
      { name: 'Rinshan Kaihou', han: '1', desc: 'Win on the replacement tile drawn after declaring a kan.' },
      { name: 'Chankan', han: '1', desc: 'Ron on the tile a player adds to their open pon to make a kan.' }
    ]
  },
  {
    label: 'Advanced',
    yaku: [
      { name: 'Sanankou', han: '2', desc: 'Three concealed triplets.' },
      { name: 'Sankantsu', han: '2', desc: 'Three kans.' },
      { name: 'Sanshoku Doukou', han: '2', desc: 'The same triplet in all three suits.' },
      { name: 'Shousangen', han: '2', desc: 'Two dragon triplets plus a pair of the third dragon (on top of the yakuhai).' },
      { name: 'Honroutou', han: '2', desc: 'Only terminals and honors — no simples at all.' },
      { name: 'Junchan', han: '3 / 2', desc: 'Every set and the pair contains a terminal — and no honors.' },
      { name: 'Honitsu', han: '3 / 2', desc: 'A single suit plus honor tiles.' },
      { name: 'Ryanpeikou', han: '3', tag: 'closed', desc: 'Two separate pairs of identical sequences.' },
      { name: 'Chinitsu', han: '6 / 5', desc: 'A single suit with no honors at all.' }
    ]
  },
  {
    label: 'Yakuman',
    yaku: [
      { name: 'Kokushi Musou', han: '★', desc: 'One of each terminal and honor, plus a second copy of one of them. (13-sided wait counts double.)' },
      { name: 'Suuankou', han: '★', desc: 'Four concealed triplets. (A single-tile pair wait counts double.)' },
      { name: 'Daisangen', han: '★', desc: 'Triplets of all three dragons.' },
      { name: 'Shousuushi', han: '★', desc: 'Three wind triplets plus a pair of the fourth wind.' },
      { name: 'Daisuushi', han: '★★', desc: 'Triplets of all four winds.' },
      { name: 'Tsuuiisou', han: '★', desc: 'A hand made entirely of honor tiles.' },
      { name: 'Chinroutou', han: '★', desc: 'A hand made entirely of terminals (1s and 9s).' },
      { name: 'Ryuuiisou', han: '★', desc: 'All green tiles: 2/3/4/6/8 of bamboo and the green dragon.' },
      { name: 'Suukantsu', han: '★', desc: 'Four kans.' },
      { name: 'Chuuren Poutou', han: '★', tag: 'closed', desc: 'A closed single-suit hand of 1112345678999 plus any one extra of that suit.' },
      { name: 'Tenhou / Chiihou', han: '★', desc: "The dealer's opening draw wins (tenhou), or a non-dealer wins on their first uninterrupted draw (chiihou)." }
    ]
  }
]

function YakuRow({ name, han, tag, desc }) {
  return (
    <Box sx={{ py: 1, borderBottom: '1px solid rgba(205,191,148,0.15)' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#e0b343' }}>{name}</Typography>
        <Chip size="small" label={han} sx={{ height: 18, fontSize: 11, bgcolor: 'rgba(224,179,67,0.2)', color: '#e0b343' }} />
        {tag && <Chip size="small" label={tag} variant="outlined" sx={{ height: 18, fontSize: 11, color: '#cdbf94', borderColor: 'rgba(205,191,148,0.4)' }} />}
      </Stack>
      <Typography variant="body2" sx={{ color: '#cdbf94' }}>{desc}</Typography>
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
          Han shown as closed / open where it differs. ★ marks a yakuman (limit hand).
        </Typography>
        {current.yaku.map((entry) => <YakuRow key={entry.name} {...entry} />)}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
