import { memo, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { t } from '../i18n/index.ts'
import type { GameVariant } from '../game/types.ts'
import type { Point } from '../state/stats.ts'
import './AdvantageChart.css'

type AdvantageChartProps = {
  /** One per position of the game, the opening included. */
  points: ReadonlyArray<Point>
  /** Which game it was; поддавки reads the same numbers upside down. */
  variant: GameVariant
}

/** Drawing space; the chart is laid out here and scaled by the page. */
const WIDTH = 640
const HEIGHT = 200
const PAD = { top: 12, right: 34, bottom: 22, left: 30 }

/** Smallest lead the scale shows, so an even game is not all axis. */
const MIN_DOMAIN = 3

/**
 * Material advantage across the game: White's lead above the axis, Black's
 * below it. One series with a sign, so the two fills carry the sign and the
 * line itself stays neutral — colouring the line as well would say the same
 * thing twice, and say it wrong where the line crosses zero.
 *
 * At поддавки the material is the same and the lead is the other way
 * round, so the series is turned over rather than redrawn: up keeps
 * meaning winning on both screens, which is the only thing a reader
 * carries over from one game to the other.
 */
export function AdvantageChart({ points, variant }: AdvantageChartProps) {
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  if (points.length < 2) return null

  const lead = (point: Point) =>
    variant === 'giveaway' ? -point.advantage : point.advantage
  const words =
    variant === 'giveaway' ? t.gameOver.chart.giveaway : t.gameOver.chart
  const last = points.length - 1
  const domain = Math.max(MIN_DOMAIN, ...points.map((p) => Math.abs(lead(p))))
  const x = (ply: number) =>
    PAD.left + (ply / last) * (WIDTH - PAD.left - PAD.right)
  const y = (value: number) =>
    PAD.top +
    ((domain - value) / (2 * domain)) * (HEIGHT - PAD.top - PAD.bottom)
  const zero = y(0)

  const line = points
    .map(
      (point, i) => `${i === 0 ? 'M' : 'L'}${x(point.ply)} ${y(lead(point))}`,
    )
    .join(' ')
  const area = `${line} L${x(last)} ${zero} L${x(0)} ${zero} Z`
  const shown = hover === null ? last : hover
  const current = points[shown]!

  /** Nearest ply to the pointer: aiming at a move, not at a 2px line. */
  function at(clientX: number): number {
    const box = svgRef.current?.getBoundingClientRect()
    // Nothing to measure against — before layout, or while the figure is
    // hidden — so the reading stays where it is rather than jumping home.
    if (box === undefined || box.width === 0) return shown
    const inside = ((clientX - box.left) / box.width) * WIDTH
    const ratio = (inside - PAD.left) / (WIDTH - PAD.left - PAD.right)
    return Math.max(0, Math.min(last, Math.round(ratio * last)))
  }

  function track(event: PointerEvent<SVGSVGElement>) {
    setHover(at(event.clientX))
  }

  function step(event: KeyboardEvent<SVGSVGElement>) {
    const by =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (by === 0) return
    event.preventDefault()
    setHover(Math.max(0, Math.min(last, (hover ?? last) + by)))
  }

  return (
    <figure className="chart">
      <figcaption className="chart__caption">
        <span className="chart__title">{words.title}</span>
        <span className="chart__legend">
          <span className="chart__key chart__key--white" aria-hidden="true" />
          {t.gameOver.chart.white}
          <span className="chart__key chart__key--black" aria-hidden="true" />
          {t.gameOver.chart.black}
        </span>
      </figcaption>
      <div className="chart__plot">
        <svg
          ref={svgRef}
          className="chart__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          tabIndex={0}
          aria-label={words.description}
          onPointerMove={track}
          onPointerLeave={() => setHover(null)}
          onKeyDown={step}
          onBlur={() => setHover(null)}
        >
          <defs>
            <clipPath id={`${clipId}-up`}>
              <rect x={0} y={PAD.top} width={WIDTH} height={zero - PAD.top} />
            </clipPath>
            <clipPath id={`${clipId}-down`}>
              <rect
                x={0}
                y={zero}
                width={WIDTH}
                height={HEIGHT - PAD.bottom - zero}
              />
            </clipPath>
          </defs>

          {[domain, -domain].map((value) => (
            <g key={value}>
              <line
                className="chart__grid"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text className="chart__tick" x={PAD.left - 6} y={y(value) + 4}>
                {value > 0 ? `+${value}` : `−${-value}`}
              </text>
            </g>
          ))}

          <path
            className="chart__fill chart__fill--white"
            d={area}
            clipPath={`url(#${clipId}-up)`}
          />
          <path
            className="chart__fill chart__fill--black"
            d={area}
            clipPath={`url(#${clipId}-down)`}
          />

          <line
            className="chart__zero"
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={zero}
            y2={zero}
          />
          <text className="chart__tick" x={PAD.left - 6} y={zero + 4}>
            0
          </text>

          {moveTicks(last)
            // The unit sits at the right edge; a tick that reaches it is
            // one the axis can do without.
            .filter((ply) => x(ply) < WIDTH - PAD.right - 14)
            .map((ply) => (
              <text
                key={ply}
                className="chart__tick chart__tick--x"
                x={x(ply)}
                y={HEIGHT - 6}
              >
                {ply / 2}
              </text>
            ))}

          <text
            className="chart__tick chart__tick--axis"
            x={WIDTH - 4}
            y={HEIGHT - 6}
          >
            {t.gameOver.chart.axis}
          </text>

          <path className="chart__line" d={line} />

          <g className="chart__cursor">
            <line
              x1={x(current.ply)}
              x2={x(current.ply)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
            <circle
              className={`chart__dot chart__dot--${sideOf(lead(current))}`}
              cx={x(current.ply)}
              cy={y(lead(current))}
              r={5}
            />
          </g>
        </svg>
        <p className="chart__readout" aria-live="polite">
          <span className="chart__readout-value">
            {t.gameOver.chart.lead(lead(current))}
          </span>
          <span className="chart__readout-move">
            {t.gameOver.chart.afterMove(Math.ceil(current.ply / 2))}
          </span>
        </p>
      </div>
      <PointTable points={points} />
    </figure>
  )
}

/**
 * Every plotted value, for a reader who cannot hover one out of the graph.
 * It is memoised because the pointer rewrites the reading many times a
 * second and never touches a row of this.
 */
const PointTable = memo(function PointTable({
  points,
}: {
  points: ReadonlyArray<Point>
}) {
  return (
    // The clipped box is the wrapper, not the table: a table sizes itself
    // to its rows whatever width and height it is given, so hiding one
    // this way leaves its full height behind in the dialog's scroll.
    <div className="chart__table">
      <table>
        <caption>{t.gameOver.chart.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.gameOver.chart.ply}</th>
            <th scope="col">{t.gameOver.chart.white}</th>
            <th scope="col">{t.gameOver.chart.black}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.ply}>
              <th scope="row">{point.ply}</th>
              <td>
                {t.gameOver.chart.pieces(point.white.men, point.white.kings)}
              </td>
              <td>
                {t.gameOver.chart.pieces(point.black.men, point.black.kings)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

function sideOf(advantage: number): 'white' | 'black' | 'level' {
  if (advantage > 0) return 'white'
  return advantage < 0 ? 'black' : 'level'
}

/** Up to six whole move numbers along the axis, on a round step. */
function moveTicks(plies: number): number[] {
  const moves = Math.floor(plies / 2)
  if (moves === 0) return []
  const step = [1, 2, 5, 10, 20, 50].find((n) => moves / n <= 6) ?? 100
  const ticks: number[] = []
  for (let move = step; move <= moves; move += step) ticks.push(move * 2)
  return ticks
}
