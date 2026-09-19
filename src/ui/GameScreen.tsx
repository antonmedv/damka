import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import { formatCorners } from '../corners/position.ts'
import { toBitPosition } from '../engine/adapter.ts'
import { moveKey } from '../engine/move.ts'
import { formatPos } from '../engine/position.ts'
import { legalMoves } from '../game/moves.ts'
import type { GameVariant, Position } from '../game/types.ts'
import { opponentById } from '../opponents/opponents.ts'
import { budgetFor, isPersonaId, personas } from '../opponents/personas.ts'
import { defaultThinker } from '../opponents/thinker.ts'
import type { Thinker } from '../opponents/thinker.ts'
import { playMove, preloadMoveSound } from '../sound/sound.ts'
import { deadlineOf } from '../state/deadline.ts'
import {
  canRedoGame,
  canUndoGame,
  clockView,
  computerToMove,
  lostOnTime,
  currentPosition,
  displayPosition,
  isReviewing,
  lastMove,
  movable,
  outcome,
  selectedSquare,
  targets,
} from '../state/gameReducer.ts'
import type { GameAction, GameState } from '../state/gameReducer.ts'
import { banterOf } from './banter.ts'
import { Board } from './Board.tsx'
import { ClockPanel } from './ClockPanel.tsx'
import { Controls } from './Controls.tsx'
import { MoveList } from './MoveList.tsx'
import { prefersReducedMotion } from './motion.ts'
import { OpponentHeader } from './OpponentHeader.tsx'
import { ResultDialog } from './ResultDialog.tsx'
import { MAX_MS as SLIDE_MAX_MS } from './slide.ts'
import './GameScreen.css'

export type GameScreenProps = {
  /** The game on the board. `Page` owns it; this screen only draws it. */
  state: GameState
  dispatch: Dispatch<GameAction>
  /**
   * The monotonic reading the clock runs on, stamped onto every action by
   * the dispatch above. One identity for the life of the page, so the
   * effects that depend on it do not re-run.
   */
  at: () => number
  /** Source of computer moves; a worker by default. */
  thinker?: Thinker
  /** Whether the computer may use the endgame tables; `?db=off` says no. */
  endgameDb?: boolean
  /** Seed for each request; random by default, fixed in tests. */
  seed?: () => number
  /**
   * Asks for a new game of the kind being played. The dialog belongs to the
   * page chrome, which opens it from the navbar as well.
   */
  onNewGame: () => void
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

/**
 * The game itself: board, clock, opponent, move list and the result
 * screen. It holds no game state of its own — `Page` owns the reducer,
 * because the navbar above and the new game dialog read the same game —
 * so everything here is drawn from `state` and asked for through
 * `dispatch`.
 */
export function GameScreen({
  state,
  dispatch,
  at,
  thinker,
  endgameDb = true,
  seed = randomSeed,
  onNewGame,
}: GameScreenProps) {
  const [resultOpen, setResultOpen] = useState(false)
  const showResult = useCallback(() => setResultOpen(true), [])
  useGameOver(state, showResult)
  useComputerMove(
    state,
    dispatch,
    useThinker(thinker, endgameDb, state.setup.variant),
    seed,
    at,
  )
  useMoveSound(state)
  // Read once: every selector below that asks how the game stands would
  // otherwise generate the same position's legal moves all over again.
  const status = outcome(state)
  const deadline = deadlineOf(state, status)

  return (
    <div className={`game${state.clock === null ? '' : ' game--timed'}`}>
      <div className="game__header">
        <OpponentHeader
          opponent={opponentById(state.setup.opponentId)}
          humanColor={state.setup.humanColor}
          toMove={currentPosition(state).toMove}
          status={status}
          onTime={lostOnTime(state) !== null}
          thinking={state.thinking !== null}
          banter={banterOf(state, status, deadline)}
          onShowResult={status === 'ongoing' ? undefined : showResult}
          onAccept={(offer) => dispatch({ type: 'accept', offer })}
          onDecline={(offer) => dispatch({ type: 'decline', offer })}
          onNewGame={onNewGame}
        />
      </div>
      <ClockPanel state={state} dispatch={dispatch} now={at} />
      <div className="game__board">
        <Board
          position={displayPosition(state)}
          orientation={state.orientation}
          selected={selectedSquare(state)}
          targets={targets(state)}
          movable={movable(state)}
          lastMove={lastMove(state)}
          overdue={deadline?.squares}
          slide={state.slide}
          reviewing={isReviewing(state)}
          busy={state.thinking !== null}
          onSquareTap={(square) => dispatch({ type: 'tap', square })}
          onSelect={(square) => dispatch({ type: 'select', square })}
          onMove={(from, to) => dispatch({ type: 'move', from, to })}
          onEscape={() => dispatch({ type: 'deselect' })}
        />
      </div>
      <aside className="game__panel">
        <div className="game__history">
          <Controls
            canUndo={canUndoGame(state)}
            canRedo={canRedoGame(state)}
            onUndo={() => dispatch({ type: 'undo' })}
            onRedo={() => dispatch({ type: 'redo' })}
            reviewing={isReviewing(state)}
            onToLive={() =>
              dispatch({ type: 'jumpTo', index: state.moves.length })
            }
          />
          <MoveList
            moves={state.moves}
            current={state.history.past.length - 1}
            onSelect={(index) => dispatch({ type: 'jumpTo', index: index + 1 })}
          />
        </div>
      </aside>
      <ResultDialog
        open={resultOpen}
        state={state}
        onClose={() => setResultOpen(false)}
        onNewGame={() => {
          setResultOpen(false)
          onNewGame()
        }}
      />
    </div>
  )
}

/**
 * Shows the result screen the moment the game ends, and only then: a screen
 * the player closed stays closed until they ask for it from the status line
 * or until another game ends.
 */
function useGameOver(state: GameState, show: () => void): void {
  // The position the game ended on, not a flag: stepping back through a
  // finished game and forward again lands on the very same position and
  // opens nothing, while taking a move back and losing differently ends
  // the game somewhere else, which is an ending of its own.
  const shownFor = useRef<Position | null>(null)
  useEffect(() => {
    if (isReviewing(state) || outcome(state) === 'ongoing') return
    const ended = currentPosition(state)
    if (shownFor.current === ended) return
    const reveal = () => {
      shownFor.current = ended
      show()
    }
    // The move that ended the game may still be flying to its square; the
    // screen would drop over the board before the player saw it land.
    if (state.slide === null || prefersReducedMotion()) {
      reveal()
      return
    }
    const timer = setTimeout(reveal, SLIDE_MAX_MS)
    return () => clearTimeout(timer)
  }, [state, show])
}

/**
 * Clicks once for every move that lands, whoever played it. Committing a
 * move builds a fresh `moves` array while undo, redo and jumpTo hand the
 * old one on, so the identity of the array tells a new move from mere
 * navigation through the game.
 */
function useMoveSound(state: GameState): void {
  const played = useRef(state.moves)
  useEffect(() => {
    preloadMoveSound()
  }, [])
  useEffect(() => {
    const before = played.current
    played.current = state.moves
    if (state.moves === before || state.moves.length === 0) return
    playMove()
  }, [state.moves])
}

/**
 * The given thinker, or one of our own. Ours lives as long as the page:
 * disposing it on unmount would also run between StrictMode's doubled
 * effects and kill the first request.
 */
/**
 * The worker is made once, so the variant it is told about is the one the
 * session opened on. That is all it needs: it decides whether to fetch the
 * endgame tables up front, and a later game of checkers starts them itself.
 */
function useThinker(
  given: Thinker | undefined,
  endgameDb: boolean,
  variant: GameVariant,
): Thinker {
  const [own] = useState<Thinker>(
    () => given ?? defaultThinker({ endgameDb, variant }),
  )
  return given ?? own
}

/** Requests for one position that may fail before the screen gives up. */
const MAX_FAILURES = 2

/**
 * Asks the persona for a move whenever it is its turn in a live, ongoing
 * game, and plays the reply if the request is still the pending one. The
 * reducer forgets the request on undo, jumpTo and newGame; the effect then
 * cancels the search so a new game never waits behind an old one. A
 * request that fails or answers with an illegal move is retried once for
 * the same position, then the screen stops asking and reports the error;
 * undo or a new game starts afresh.
 */
function useComputerMove(
  state: GameState,
  dispatch: Dispatch<GameAction>,
  thinker: Thinker,
  seed: () => number,
  at: () => number,
): void {
  const issued = useRef<{ id: number; forState: GameState } | null>(null)
  const failed = useRef<{ position: Position; count: number } | null>(null)
  const nextId = useRef(1)
  // Start the worker before the first move is asked for: it fetches the
  // endgame tables while the player is still thinking about theirs.
  const opponentId = state.setup.opponentId
  useEffect(() => {
    if (isPersonaId(opponentId)) thinker.warmUp?.()
  }, [thinker, opponentId])
  useEffect(() => {
    const pending = issued.current
    // The same state once more (StrictMode runs effects twice): nothing new.
    if (pending !== null && pending.forState === state) return
    if (state.thinking === null && pending !== null) {
      issued.current = null
      thinker.cancel()
    }
    if (state.thinking !== null || !computerToMove(state)) return
    const persona = state.setup.opponentId
    if (!isPersonaId(persona)) return
    const position = currentPosition(state)
    const failures = failed.current
    if (failures?.position === position && failures.count >= MAX_FAILURES) {
      return
    }
    const id = nextId.current++
    issued.current = { id, forState: state }
    dispatch({ type: 'think', id })
    const fail = (error: unknown): void => {
      const before = failed.current
      failed.current = {
        position,
        count: before?.position === position ? before.count + 1 : 1,
      }
      console.error('computer move failed', error)
      dispatch({ type: 'thinkFailed', id })
    }
    const variant = state.setup.variant
    const literal =
      variant === 'corners'
        ? formatCorners(position)
        : formatPos(toBitPosition(position))
    // On a clock the persona thinks out of its own bank, so its limits
    // come from what is left of it rather than from the persona alone.
    const clock = clockView(state, at())
    const limits =
      clock === null
        ? {}
        : budgetFor(
            personas[persona],
            clock.remaining[position.toMove],
            clock.timings[position.toMove].incrementMs,
          )
    thinker
      .think({
        id,
        variant,
        position: literal,
        persona,
        seed: seed(),
        ...limits,
      })
      .then(
        (reply) => {
          if (issued.current?.id !== id) return
          issued.current = null
          const key = moveKey(reply.move)
          const legal = legalMoves(position, variant)
          if (!legal.some((move) => moveKey(move) === key)) {
            fail(new Error(`illegal reply ${key} in ${literal}`))
            return
          }
          failed.current = null
          dispatch({
            type: 'computerMove',
            id,
            move: reply.move,
            score: reply.score,
          })
        },
        (error: unknown) => {
          // Cancelled by this effect: `issued` was cleared before `cancel()`.
          if (issued.current?.id !== id) return
          issued.current = null
          fail(error)
        },
      )
  }, [state, dispatch, thinker, seed, at])
}
