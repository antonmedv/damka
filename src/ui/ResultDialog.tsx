import { useRef } from 'react'
import { opposite } from '../game/board.ts'
import { formatDuration } from '../game/timeControl.ts'
import type { Color, GameStatus } from '../game/types.ts'
import { t } from '../i18n/index.ts'
import { Avatar } from '../opponents/avatars/Avatar.tsx'
import { opponentById } from '../opponents/opponents.ts'
import {
  finalAgreed,
  finalLostOnTime,
  finalOutcome,
  finalPosition,
} from '../state/gameReducer.ts'
import type { GameState } from '../state/gameReducer.ts'
import { gameStats, materialOf } from '../state/stats.ts'
import type { GameStats, SideStats } from '../state/stats.ts'
import { AdvantageChart } from './AdvantageChart.tsx'
import { useDialog } from './useDialog.ts'
import './ResultDialog.css'

type ResultDialogProps = {
  open: boolean
  state: GameState
  onClose: () => void
  /** Opens the new-game dialog; this one closes with it. */
  onNewGame: () => void
}

/**
 * How the game ended and what it looked like on the way there. Everything
 * here is read at the end of the timeline, so the screen says the same
 * thing whichever position is being reviewed behind it.
 */
export function ResultDialog({
  open,
  state,
  onClose,
  onNewGame,
}: ResultDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useDialog(dialogRef, open)

  return (
    <dialog
      ref={dialogRef}
      className="result"
      aria-labelledby="result-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {open && <Result state={state} onClose={onClose} onNewGame={onNewGame} />}
    </dialog>
  )
}

/** Mounted only while the dialog is open, so the graph is drawn once. */
function Result({
  state,
  onClose,
  onNewGame,
}: Omit<ResultDialogProps, 'open'>) {
  const status = finalOutcome(state)
  const onTime = finalLostOnTime(state) !== null
  const winner = winnerOf(status)
  const human = state.setup.humanColor
  const opponent = opponentById(state.setup.opponentId)
  const stats = gameStats(state)
  const headline =
    winner === null
      ? t.result.draw
      : onTime
        ? t.resultOnTime[winner]
        : t.result[winner]
  const mood =
    winner === null || human === 'both'
      ? 'draw'
      : winner === human
        ? 'win'
        : 'loss'

  return (
    <div className="result__body">
      <header className="result__head">
        <Avatar id={opponent.id} size={48} />
        <div className="result__headings">
          <h2
            id="result-title"
            className={`result__title result__title--${mood}`}
          >
            {headline}
          </h2>
          <p className="result__lead">{leadOf(state, winner)}</p>
          <p className="result__reason">{reasonOf(state, status, onTime)}</p>
        </div>
      </header>

      <AdvantageChart points={stats.points} />

      <Table
        stats={stats}
        human={human}
        opponentName={t.opponents[opponent.id].name}
      />

      <div className="result__actions">
        <button type="button" className="button" onClick={onClose}>
          {t.gameOver.close}
        </button>
        <button
          type="button"
          className="button button--accent"
          onClick={onNewGame}
        >
          {t.gameOver.newGame}
        </button>
      </div>
    </div>
  )
}

function winnerOf(status: GameStatus): Color | null {
  if (status === 'whiteWins') return 'white'
  return status === 'blackWins' ? 'black' : null
}

/** Who won, in the player's own terms; nothing to say in a hot-seat game. */
function leadOf(state: GameState, winner: Color | null): string {
  const human = state.setup.humanColor
  if (winner === null || human === 'both') return ''
  if (winner === human) return t.gameOver.youWon
  return t.gameOver.winner(t.opponents[state.setup.opponentId].name)
}

/**
 * Why it ended: the clock, an agreement between the players, the rules of
 * the draw, or a side with nothing left.
 */
function reasonOf(
  state: GameState,
  status: GameStatus,
  onTime: boolean,
): string {
  if (onTime) return t.gameOver.reason.time
  // Settled between the two of them; the board had not decided anything.
  const agreed = finalAgreed(state)
  if (agreed !== null) {
    return agreed.status === 'draw'
      ? t.gameOver.reason.agreed
      : t.gameOver.reason.resigned
  }
  if (status === 'draw') return t.gameOver.reason.drawRule
  const winner = winnerOf(status)
  if (winner === null) return ''
  const left = materialOf(finalPosition(state), opposite(winner))
  return left.men + left.kings === 0
    ? t.gameOver.reason.noPieces
    : t.gameOver.reason.noMoves
}

type TableProps = {
  stats: GameStats
  human: Color | 'both'
  opponentName: string
}

/** The two sides side by side; the player's own column comes first. */
function Table({ stats, human, opponentName }: TableProps) {
  const sides: ReadonlyArray<Color> =
    human === 'both' ? ['white', 'black'] : [human, opposite(human)]
  const heads =
    human === 'both'
      ? [t.gameOver.stats.white, t.gameOver.stats.black]
      : [t.gameOver.stats.you, opponentName]
  const columns = sides.map((side) => stats[side])
  const rows: { label: string; values: string[] }[] = [
    {
      label: t.gameOver.stats.moves,
      values: columns.map((s) => String(s.moves)),
    },
    {
      label: t.gameOver.stats.taken,
      values: columns.map((s) => String(s.taken)),
    },
    {
      label: t.gameOver.stats.crowned,
      values: columns.map((s) => String(s.crowned)),
    },
    { label: t.gameOver.stats.biggest, values: columns.map(bestOf) },
  ]
  if (stats.timed) {
    rows.push(
      {
        label: t.gameOver.stats.time,
        values: columns.map((s) => formatDuration(s.spentMs)),
      },
      {
        label: t.gameOver.stats.longest,
        values: columns.map((s) => formatDuration(s.longestMs)),
      },
    )
  }

  return (
    <table className="result__table">
      <caption className="result__table-caption">
        {t.gameOver.stats.title}
      </caption>
      <thead>
        <tr>
          <td />
          {heads.map((head, i) => (
            <th key={head} scope="col">
              <span
                className={`result__swatch result__swatch--${sides[i]}`}
                aria-hidden="true"
              />
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            {row.values.map((value, i) => (
              <td key={heads[i]}>{value}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function bestOf(side: SideStats): string {
  return side.best === 0
    ? t.gameOver.stats.none
    : t.gameOver.stats.inOneMove(side.best)
}
