import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import {
  Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
  IconButton, MobileStepper, Tooltip
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import Tile, { SIZES } from './Tile.jsx'
import { tileFullName, sortTiles } from '../game/tiles.js'

const GOLD = '#e0b343'

// The tutorial runs outside a game, so there's no TileHoverContext and tiles
// show no tooltip on their own. Wrap them to reveal each tile's beginner name
// (e.g. "5 Circles", "East Wind") on hover instead.
function NamedTile(props) {
  return (
    <Tooltip arrow disableInteractive title={tileFullName(props.tile)}>
      <Box sx={{ display: 'inline-flex' }}>
        <Tile {...props} />
      </Box>
    </Tooltip>
  )
}

// Keeps a row of tiles on a single line, scaling it down uniformly to fit the
// available width instead of wrapping. A full 14-tile hand at `md` overflows a
// phone and would otherwise wrap into ragged 9/3/1 lines; this shrinks it to one
// tidy row.
//
// `transform: scale` doesn't shrink an element's layout box, so the scaled row is
// taken out of flow (absolute) and the outer's measured height (natural height ×
// scale) is what following content flows under — otherwise the row's full-size
// layout box would overlap the caption beneath it. `width: max-content` keeps the
// measured natural width to the true single-line width regardless of how narrow
// the container gets. The inner stays measurable (and the lift on the discard
// demo can poke above) via `overflow: visible`.
function FitRow({ children, justify = 'center' }) {
  const outerRef = useRef(null)
  const innerRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState()
  const left = justify === 'flex-start'

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return undefined
    const compute = () => {
      const natW = inner.offsetWidth
      const natH = inner.offsetHeight
      if (!natW || !natH) return
      const next = Math.min(1, outer.clientWidth / natW)
      setScale(next)
      setHeight(natH * next)
    }
    compute()
    // Observe only the outer (available width). It resizes whenever the dialog or
    // viewport does — which is also when the vmin-sized tiles change — so this
    // catches every relevant change without feeding the scale back into itself.
    const observer = new ResizeObserver(compute)
    observer.observe(outer)
    return () => observer.disconnect()
  }, [])

  return (
    <Box ref={outerRef} sx={{ position: 'relative', width: '100%', height }}>
      <Box
        ref={innerRef}
        sx={{
          position: 'absolute', top: 0, left: left ? 0 : '50%', width: 'max-content',
          transformOrigin: left ? 'top left' : 'top center',
          transform: left ? `scale(${scale})` : `translateX(-50%) scale(${scale})`
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

// A non-interactive row of tiles, optionally with a caption underneath — used to
// show example sets and complete hands. `fit` scales a long row to fit the width
// on one line; leave it off for short rows that sit side by side (they'd each
// grab the full width and stack).
function TileRow({ tiles, caption, size = 'md', fit = false }) {
  const row = (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: fit ? 'nowrap' : 'wrap', justifyContent: 'center' }}>
      {tiles.map((tile, idx) => <NamedTile key={idx} tile={tile} size={size} />)}
    </Box>
  )
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      {fit ? <FitRow>{row}</FitRow> : row}
      {caption && (
        <Typography variant="caption" sx={{ color: '#cdbf94' }}>{caption}</Typography>
      )}
    </Box>
  )
}

// The dashed slot that stands in for the missing tile in a quiz.
function GapSlot({ size = 'md' }) {
  const dims = SIZES[size]
  return (
    <Box sx={{
      width: dims.w, height: dims.h, borderRadius: 1, border: `2px dashed ${GOLD}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: GOLD, fontSize: '1.4rem', fontWeight: 700, flexShrink: 0
    }}>?</Box>
  )
}

// Fisher-Yates shuffle, returning a new array.
function shuffle(items) {
  const copy = [...items]
  for (let idx = copy.length - 1; idx > 0; idx--) {
    const swap = Math.floor(Math.random() * (idx + 1))
    ;[copy[idx], copy[swap]] = [copy[swap], copy[idx]]
  }
  return copy
}

// A "tap the tile that completes this group" quiz. `partial` is the tiles shown
// with one missing slot (a `null` entry renders the gap); `options` are the
// clickable candidates; `answer` is the correct kind. Picking right fills the
// gap and reveals a success line. The option order is shuffled on mount so the
// answer's position isn't fixed; the step content remounts on navigation, so it
// re-scrambles each time you enter the step.
function TileQuiz({ partial, options, answer }) {
  const [picked, setPicked] = useState(null)
  const [order] = useState(() => shuffle(options))
  const solved = picked === answer

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, mt: 1 }}>
      <FitRow>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-end', justifyContent: 'center', minHeight: SIZES.md.h }}>
          {partial.map((tile, idx) =>
            tile === null
              ? <Box key={idx}>{solved ? <NamedTile tile={answer} /> : <GapSlot />}</Box>
              : <NamedTile key={idx} tile={tile} />
          )}
        </Box>
      </FitRow>

      {solved ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#7bc67b' }}>
          <CheckCircleIcon fontSize="small" />
          <Typography variant="body2">Nice — that completes it.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ color: '#cdbf94' }}>Tap the tile that fits:</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {order.map((opt) => (
              <Box key={opt} sx={{ opacity: picked && picked !== opt ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                <NamedTile tile={opt} size="lg" onClick={() => setPicked(opt)} />
              </Box>
            ))}
          </Box>
          {picked && picked !== answer && (
            <Typography variant="caption" sx={{ color: '#e57373' }}>Not quite — try another.</Typography>
          )}
        </Box>
      )}
    </Box>
  )
}

// An interactive draw/discard: a 13-tile hand plus a freshly drawn tile (the lone
// Red Dragon, which pairs with nothing). The lift-then-commit gesture matches the
// real game's Hand. Throwing the dragon keeps every set intact and reaches tenpai.
const DEMO_HAND = ['3m', '4m', '5m', '6p', '7p', '8p', '4s', '5s', '6s', '2p', '2p', '1z', '1z']
const DEMO_DRAWN = '7z'

function DiscardDemo() {
  const [selected, setSelected] = useState(null)
  const [discarded, setDiscarded] = useState(null)
  const containerRef = useRef(null)

  // Click-away: a click outside the hand puts the lifted tile back down (matches
  // the real game's Hand).
  useEffect(() => {
    if (selected === null) return undefined
    const onDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setSelected(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selected])

  const handleClick = (tile, key) => {
    if (selected === key) {
      setSelected(null)
      setDiscarded(tile)
    } else {
      setSelected(key)
    }
  }

  const renderTile = (tile, key) => (
    <NamedTile
      key={key}
      tile={tile}
      size="md"
      selected={selected === key}
      onClick={discarded ? undefined : () => handleClick(tile, key)}
      disabled={!!discarded}
    />
  )

  return (
    <Box ref={containerRef} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <FitRow>
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
            {sortTiles(DEMO_HAND).map((tile, idx) => renderTile(tile, idx))}
          </Box>
          <Box sx={{ ml: 1.5 }}>{renderTile(DEMO_DRAWN, 'drawn')}</Box>
        </Box>
      </FitRow>

      {discarded ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          {discarded === DEMO_DRAWN ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#7bc67b', textAlign: 'center' }}>
              <CheckCircleIcon fontSize="small" />
              <Typography variant="body2">
                You threw the lone Red Dragon, leaving three sequences and two pairs — that's tenpai!
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#e0b343', textAlign: 'center' }}>
              You discarded the {tileFullName(discarded)}. That works, but it broke up a group — the
              lone Red Dragon was the tile to let go.
            </Typography>
          )}
          <Button size="small" onClick={() => setDiscarded(null)}>Try again</Button>
        </Box>
      ) : (
        <Typography variant="caption" sx={{ color: '#cdbf94' }}>
          {selected ? 'Tap it again to throw it away.' : 'Tap a tile to lift it.'}
        </Typography>
      )}
    </Box>
  )
}

// A labeled entry in a list: a name, a one-line description, and an optional
// tile example. Used by both the yaku and calls pages.
function LabeledTiles({ name, desc, tiles }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ color: GOLD, fontWeight: 700 }}>{name}</Typography>
      <Typography variant="body2" sx={{ color: '#cdbf94' }}>{desc}</Typography>
      {tiles && (
        <Box sx={{ mt: 0.5 }}>
          <FitRow justify="flex-start">
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {tiles.map((tile, idx) => <NamedTile key={idx} tile={tile} size="md" />)}
            </Box>
          </FitRow>
        </Box>
      )}
    </Box>
  )
}

// Each step renders its own teaching content. Kept as plain render functions so
// the tile examples can reuse the live Tile component.
const STEPS = [
  {
    label: 'The goal',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Mahjong is a tile-collecting game. You win by completing your hand:
          <b> four sets plus a matching pair</b> — fourteen tiles in all.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
          <TileRow tiles={['1m', '2m', '3m']} caption="sequence" size="lg" />
          <TileRow tiles={['4p', '5p', '6p']} caption="sequence" size="lg" />
          <TileRow tiles={['7s', '8s', '9s']} caption="sequence" size="lg" />
          <TileRow tiles={['2z', '2z', '2z']} caption="triplet" size="lg" />
          <TileRow tiles={['5m', '5m']} caption="pair" size="lg" />
        </Box>
        <Typography variant="body2" sx={{ mt: 2, color: '#cdbf94' }}>
          That's a winning hand. The rest of the tutorial shows how the pieces fit together.
        </Typography>
      </Box>
    )
  },
  {
    label: 'The tiles',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          There are three numbered suits running 1–9, plus seven honor tiles. Four copies of every kind.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TileRow tiles={['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m']} caption="Characters (man)" size="md" fit />
          <TileRow tiles={['1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p']} caption="Circles (pin)" size="md" fit />
          <TileRow tiles={['1s', '2s', '3s', '4s', '5s', '6s', '7s', '8s', '9s']} caption="Bamboo (sou)" size="md" fit />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', mt: 0.5 }}>
            <TileRow tiles={['1z', '2z', '3z', '4z']} caption="Winds (E S W N)" size="md" />
            <TileRow tiles={['5z', '6z', '7z']} caption="Dragons" size="md" />
          </Box>
        </Box>
      </Box>
    )
  },
  {
    label: 'Sequences',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 1 }}>
          A <b>sequence</b> is three tiles in a row of the <i>same</i> suit, like 4-5-6 of bamboo.
          Honor tiles can't form sequences — they have no order.
        </Typography>
        <TileQuiz partial={['5p', null, '7p']} options={['4p', '6p', '8p']} answer="6p" />
      </Box>
    )
  },
  {
    label: 'Triplets & pairs',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 1 }}>
          A <b>triplet</b> is three identical tiles, and a <b>pair</b> is two identical tiles.
          Any tile can form these — including honors.
        </Typography>
        <TileQuiz partial={['7z', '7z', null]} options={['5z', '6z', '7z']} answer="7z" />
        <Typography variant="body2" sx={{ mt: 3 }}>
          But honors — the winds and dragons — have no numeric order, so they can <b>only</b> pair up
          or form triplets, never a sequence. Three different honors don't make a set:
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <NamedTile tile="1z" size="md" />
              <NamedTile tile="2z" size="md" />
              <NamedTile tile="3z" size="md" />
            </Box>
            <Typography variant="caption" sx={{ color: '#e57373' }}>✗ not a sequence</Typography>
          </Box>
        </Box>
      </Box>
    )
  },
  {
    label: 'Your turn',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          You hold <b>thirteen</b> tiles. On your turn you draw one (making fourteen), then discard one
          you don't need — back to thirteen. Tap a tile once to lift it, again to throw it away. You
          just drew the Red Dragon, set apart on the right. Try discarding a tile:
        </Typography>
        <DiscardDemo />
        <Typography variant="body2" sx={{ mt: 2, color: '#cdbf94' }}>
          Slowly your draws and discards shape thirteen loose tiles into four sets and a pair.
        </Typography>
      </Box>
    )
  },
  {
    label: 'Calls — pon, chi, kan',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          You don't only draw. When another player discards a tile you need, you can <b>call</b> it to
          finish a set right away, out of turn.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LabeledTiles
            name="Pon — triplet"
            desc="Claim any player's discard to complete a triplet (two matching tiles in hand + the discard)."
            tiles={['3s', '3s', '3s']}
          />
          <LabeledTiles
            name="Chi — sequence"
            desc="Claim only from the player to your left to complete a sequence."
            tiles={['4p', '5p', '6p']}
          />
          <LabeledTiles
            name="Kan — four of a kind"
            desc="Claim or declare a fourth matching tile. You draw a replacement and a new dora is revealed."
            tiles={['1z', '1z', '1z', '1z']}
          />
        </Box>
        <Typography variant="body2" sx={{ mt: 2, color: '#cdbf94' }}>
          The catch: a called set is laid <b>face-up</b>, so your hand is no longer concealed. That's
          faster, but it closes off riichi and many yaku — call only when it's worth it.
        </Typography>
      </Box>
    )
  },
  {
    label: 'Tenpai & winning',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 1 }}>
          When you're a single tile away from completing your hand, you're <b>tenpai</b> — ready
          (and the game's namesake). This hand has everything but the middle tile of one sequence:
        </Typography>
        <TileQuiz
          partial={['2m', '3m', '4m', '6m', '7m', '8m', '3p', '4p', '5p', '5s', '5s', '6s', null, '8s']}
          options={['5s', '7s', '8s', '9s']}
          answer="7s"
        />
        <Typography variant="body2" sx={{ mt: 2, color: '#cdbf94' }}>
          You win by <b>drawing</b> that tile yourself (tsumo) or <b>claiming</b> it the instant an
          opponent discards it (ron). Every tile here is a 2–8 simple, which is itself a scoring
          pattern (tanyao) — so this hand is a valid win either way.
        </Typography>
      </Box>
    )
  },
  {
    label: 'Yaku — scoring patterns',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Four sets and a pair isn't quite enough on its own: a winning hand also needs at least one
          <b> yaku</b> — a named pattern worth points. No yaku, no win. There are dozens; these are
          the ones you'll lean on first.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <LabeledTiles
            name="Riichi"
            desc="Declare when your hand is fully concealed and tenpai. It's a 1,000-point bet that counts as a yaku by itself — the reliable beginner's win."
          />
          <LabeledTiles
            name="Tanyao — all simples"
            desc="Every tile is a 2–8 number tile: no terminals (1 or 9) and no honors. Triplets count too, and it's one of the few yaku you keep even with an open hand — so you can pon toward it."
            tiles={['3m', '4m', '5m', '6p', '6p', '6p', '5s', '5s']}
          />
          <LabeledTiles
            name="Yakuhai — value triplet"
            desc="A triplet of any dragon, or of your seat wind or the round wind."
            tiles={['7z', '7z', '7z']}
          />
          <LabeledTiles
            name="Pinfu — all sequences"
            desc="Four sequences and a plain pair (no value tiles), finished on a two-sided wait. Terminals are fine — unlike tanyao, pinfu cares about shape, not which numbers. Here the pair is a terminal (9 of circles)."
            tiles={['1m', '2m', '3m', '5s', '6s', '7s', '9p', '9p']}
          />
          <LabeledTiles
            name="Sanshoku — three-colour straight"
            desc="The same run in all three suits at once."
            tiles={['3m', '4m', '5m', '3p', '4p', '5p', '3s', '4s', '5s']}
          />
          <LabeledTiles
            name="Dora & red fives — bonus han"
            desc="Dora aren't yaku, but each one in your hand adds a han once you already have a yaku. A flipped indicator marks the round's dora, and red fives (one per suit, if the host enables them) are always worth a bonus han."
            tiles={['0m', '0p', '0s']}
          />
        </Box>
      </Box>
    )
  },
  {
    label: 'Ready to play',
    render: () => (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          That's the core. A few things to know once you're at the table:
        </Typography>
        <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1 } }}>
          <Typography component="li" variant="body2">
            <b>Hover any tile</b> to see how many copies are still unseen — handy for judging your waits.
          </Typography>
          <Typography component="li" variant="body2">
            The buttons below your hand offer calls (pon, chi, kan) and riichi whenever they're available.
          </Typography>
          <Typography component="li" variant="body2">
            Calls — and even wins — are optional. When you're offered a pon, chi, kan, or a winning
            tile (ron/tsumo), you can take it or <b>pass</b> and keep playing.
          </Typography>
          <Typography component="li" variant="body2">
            The <b>Yaku</b> button up in the header opens a reference of every scoring pattern, paged
            from the basics up to the rare yakuman — peek at it any time you forget one.
          </Typography>
        </Box>
        <Typography variant="body1" sx={{ mt: 2 }}>
          You'll pick the rest up by playing. Good luck!
        </Typography>
      </Box>
    )
  }
]

export default function Tutorial({ open, onClose }) {
  const [step, setStep] = useState(0)
  const last = STEPS.length - 1

  const close = () => {
    onClose()
    // Reset for next open after the closing transition.
    setTimeout(() => setStep(0), 200)
  }

  const current = STEPS[step]

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <Box>
          <Typography variant="overline" sx={{ color: '#8a9', display: 'block', lineHeight: 1 }}>
            Step {step + 1} of {STEPS.length}
          </Typography>
          <Typography variant="h6" sx={{ color: GOLD, fontWeight: 800 }}>{current.label}</Typography>
        </Box>
        <IconButton onClick={close} aria-label="Close tutorial"><CloseIcon /></IconButton>
      </DialogTitle>

      {/* No fixed height — the dialog hugs each step's content, so a short step is
          a short modal (no dead space) and a long one grows then scrolls. Keyed by
          step so navigating remounts: quiz order re-scrambles and per-step state
          (picks, the discard demo) resets. */}
      {/* `scrollbarGutter: stable` keeps the content width constant whether or not
          the vertical scrollbar is showing. Without it, a FitRow shrinking its
          reserved height can remove the scrollbar, which widens the content, which
          rescales the row taller, which brings the scrollbar back — an endless
          resize loop that visibly flickers (worst on narrow portrait screens). */}
      <DialogContent dividers sx={{ scrollbarGutter: 'stable' }}>
        <Box key={step}>{current.render()}</Box>
      </DialogContent>

      <DialogActions sx={{ p: 0 }}>
        <MobileStepper
          variant="dots"
          steps={STEPS.length}
          position="static"
          activeStep={step}
          sx={{ flex: 1, background: 'transparent' }}
          backButton={
            <Button size="small" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
              Back
            </Button>
          }
          nextButton={
            step === last
              ? <Button size="small" variant="contained" onClick={close}>Got it</Button>
              : <Button size="small" onClick={() => setStep((value) => value + 1)}>Next</Button>
          }
        />
      </DialogActions>
    </Dialog>
  )
}
