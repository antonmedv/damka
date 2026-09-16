import type { Dispatch } from 'react'
import { clockView } from '../state/gameReducer.ts'
import type { GameAction, GameState } from '../state/gameReducer.ts'
import { Clocks } from './Clocks.tsx'
import { useClockTick } from './useClockTick.ts'

type ClockPanelProps = {
  state: GameState
  dispatch: Dispatch<GameAction>
  /** Source of the monotonic time; the real one by default. */
  now?: () => number
}

/**
 * The only part of the screen that re-renders ten times a second. Keeping
 * the tick here rather than in `GameScreen` means the board, the move list
 * and their selectors are left alone between moves.
 */
export function ClockPanel({ state, dispatch, now }: ClockPanelProps) {
  const view = clockView(state, useClockTick(state, dispatch, now))
  if (view === null) return null
  return (
    <div className="game__clocks">
      <Clocks
        view={view}
        orientation={state.orientation}
        humanColor={state.setup.humanColor}
      />
    </div>
  )
}
