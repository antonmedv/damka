import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { GameVariant, Position } from '../game/types.ts'
import { t } from '../i18n/index.ts'
import type { Thinker } from '../opponents/thinker.ts'
import {
  defaultSetup,
  gameReducer,
  initialState,
} from '../state/gameReducer.ts'
import type { GameAction, GameSetup } from '../state/gameReducer.ts'
import { prefsFrom, savePrefs } from '../state/preferences.ts'
import type { ColorChoice } from '../state/preferences.ts'
import { GameScreen } from './GameScreen.tsx'
import { NavBar } from './NavBar.tsx'
import { NewGameDialog } from './NewGameDialog.tsx'
import { realNow } from './useClockTick.ts'

export type PageProps = {
  /** Setup of the first game; by default the first persona, human white. */
  initialSetup?: GameSetup
  /** Position the first game starts from; the normal opening by default. */
  initialPosition?: Position | null
  /** Colour the dialog preselects; the colour of the first game by default. */
  initialColor?: ColorChoice
  /** Source of computer moves; a worker by default. */
  thinker?: Thinker
  /** Whether the computer may use the endgame tables; `?db=off` says no. */
  endgameDb?: boolean
  /** Seed for each request; random by default, fixed in tests. */
  seed?: () => number
  /** Source of the monotonic time the clock runs on; fixed in tests. */
  now?: () => number
}

/**
 * Page chrome above and below, the game between them — and the owner of
 * the game itself. The navbar draws the tab of the game on the board and
 * carries the board's own flip button, and the new game dialog is opened
 * from the bar as much as from the screen below it, so both of them live
 * here with the state they read. Everything travels downwards: the screen
 * hands nothing back up.
 */
export function Page({
  initialSetup = defaultSetup,
  initialPosition = null,
  initialColor = initialSetup.humanColor === 'both'
    ? 'white'
    : initialSetup.humanColor,
  thinker,
  endgameDb = true,
  seed,
  now = realNow,
}: PageProps) {
  const [state, send] = useReducer(gameReducer, null, () =>
    initialState(initialSetup, initialPosition ?? undefined, now()),
  )
  // `now` may be a fresh function on every render, so the stamping
  // dispatch reads it from a ref and keeps one identity for the effects
  // that depend on it.
  const clockSource = useRef(now)
  useEffect(() => {
    clockSource.current = now
  }, [now])
  // Every action carries the moment it happened, so the reducer can charge
  // the clock without ever reading one itself.
  const at = useCallback(() => clockSource.current(), [])
  // The stamp goes on first, so an action that measured its own moment —
  // the flag, which decided on the reading it took — keeps it.
  const dispatch = useCallback(
    (action: GameAction) => send({ at: at(), ...action }),
    [send, at],
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  // Set while the dialog is open on a game other than the one being
  // played; cleared when it closes, whichever way it closes.
  const [asked, setAsked] = useState<GameVariant | null>(null)
  // Kept beside the setup, which only ever holds a colour that was rolled.
  const [colorChoice, setColorChoice] = useState<ColorChoice>(initialColor)
  // A tab opens the dialog rather than switching underneath the players,
  // so a tab pressed by accident never throws away the game in progress.
  const openNewGame = useCallback((variant: GameVariant) => {
    setAsked(variant)
    setDialogOpen(true)
  }, [])
  const closeDialog = useCallback(() => {
    setDialogOpen(false)
    setAsked(null)
  }, [])
  const newGameHere = useCallback(
    () => openNewGame(state.setup.variant),
    [openNewGame, state.setup.variant],
  )
  const flip = useCallback(() => dispatch({ type: 'flipBoard' }), [dispatch])

  return (
    <>
      <NavBar
        current={state.setup.variant}
        onSelect={openNewGame}
        onFlip={flip}
      />
      <main className="app">
        <GameScreen
          state={state}
          dispatch={dispatch}
          at={at}
          thinker={thinker}
          endgameDb={endgameDb}
          seed={seed}
          onNewGame={newGameHere}
        />
      </main>
      <footer className="credit">{t.credit}</footer>
      <NewGameDialog
        open={dialogOpen}
        initial={
          asked === null ? state.setup : { ...state.setup, variant: asked }
        }
        initialColor={colorChoice}
        onStart={(setup, color) => {
          setColorChoice(color)
          // Remembered so the next game, and the next visit, open on it.
          savePrefs(prefsFrom(setup, color))
          dispatch({ type: 'newGame', setup })
          closeDialog()
        }}
        onCancel={closeDialog}
      />
    </>
  )
}
