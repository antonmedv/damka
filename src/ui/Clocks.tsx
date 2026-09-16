import { opposite } from '../game/board.ts'
import { formatClock } from '../game/timeControl.ts'
import type { Color } from '../game/types.ts'
import { t } from '../i18n/index.ts'
import type { ClockView } from '../state/gameReducer.ts'
import './Clocks.css'

type ClocksProps = {
  /** null in an untimed game: nothing is rendered at all. */
  view: ClockView | null
  /** Colour at the bottom of the board; its clock sits at the bottom too. */
  orientation: Color
  humanColor: Color | 'both'
}

/** Where the readout starts warning. */
const LOW_MS = 10_000

export function Clocks({ view, orientation, humanColor }: ClocksProps) {
  if (view === null) return null
  return (
    <div className="clocks">
      <ClockRow view={view} side={opposite(orientation)} human={humanColor} />
      <ClockRow view={view} side={orientation} human={humanColor} />
      <p className="clocks__alert" role="status">
        {lowTimeAlert(view, humanColor)}
      </p>
    </div>
  )
}

type ClockRowProps = {
  view: ClockView
  side: Color
  human: Color | 'both'
}

function ClockRow({ view, side, human }: ClockRowProps) {
  const ms = view.remaining[side]
  const label = labelFor(side, human)
  const classes = ['clocks__row']
  if (view.running === side) classes.push('clocks__row--running')
  if (view.flagged === side) classes.push('clocks__row--flagged')
  else if (ms < LOW_MS) classes.push('clocks__row--low')
  return (
    <p className={classes.join(' ')}>
      <span className="clocks__label">{label}</span>
      {/* The digits change ten times a second; announcing them would make
          the screen reader useless, so only the label is spoken. */}
      <span className="clocks__time" aria-hidden="true">
        {formatClock(ms)}
      </span>
    </p>
  )
}

function labelFor(side: Color, human: Color | 'both'): string {
  if (human === 'both') return t.clock.side[side]
  return side === human ? t.clock.yourTime : t.clock.opponentTime
}

/** Thresholds worth saying out loud, tightest first so the closest wins. */
const ALERTS_MS = [10_000, 30_000]

/**
 * What the screen reader should hear about the player's own bank: one
 * sentence per threshold passed, and nothing at all between them. The text
 * is derived, not remembered, so it says the same thing on every tick and
 * is announced once — and the other side taking over clears it.
 */
function lowTimeAlert(view: ClockView, human: Color | 'both'): string {
  if (view.flagged !== null) return t.clock.flag
  const side = view.running
  if (side === null || (human !== 'both' && side !== human)) return ''
  const left = view.remaining[side]
  const passed = ALERTS_MS.find((ms) => left <= ms)
  return passed === undefined ? '' : t.clock.low(passed / 1000)
}
