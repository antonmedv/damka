import { useEffect, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import { clockView } from '../state/gameReducer.ts'
import type { GameAction, GameState } from '../state/gameReducer.ts'

/** Ten readings a second: enough for tenths, cheap enough to ignore. */
const TICK_MS = 100

/** The clock the app reads when nobody hands it another one. */
export function realNow(): number {
  return performance.now()
}

/**
 * Keeps the clock readouts moving and calls the flag when a bank empties.
 * The hook holds no time of its own: it returns the moment the screen
 * should render for, and the reducer decides what that means.
 *
 * A hidden tab throttles the interval to about once a second, which is
 * exactly right for a wall clock — the time is spent either way, and the
 * flag is noticed on the next reading or when the tab comes back.
 */
export function useClockTick(
  state: GameState,
  dispatch: Dispatch<GameAction>,
  now: () => number = realNow,
): number {
  const [stamp, setStamp] = useState(now)
  // Held in a ref so a caller that builds the function inline does not
  // re-arm the interval on every render — which would render for ever.
  const read = useRef(now)
  useEffect(() => {
    read.current = now
  }, [now])
  const running = state.clock !== null && state.clock.startedAt !== null
  // The effect follows `state` so the flag is judged on the position that
  // is really on the board. Re-arming on each action costs a tick's phase,
  // which measured no worse than keeping the state in a ref.
  useEffect(() => {
    if (!running) return
    const tick = (): void => {
      const at = read.current()
      setStamp(at)
      const view = clockView(state, at)
      if (view === null) return
      const side = view.running
      if (side === null || view.remaining[side] > 0) return
      dispatch({ type: 'flag', color: side, at })
    }
    tick()
    const timer = setInterval(tick, TICK_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [state, dispatch, running])
  return stamp
}
