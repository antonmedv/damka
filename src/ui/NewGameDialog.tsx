import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  MAX_INCREMENT,
  MAX_MINUTES,
  incrementOf,
  isPreset,
  isSplit,
  isValidIncrement,
  isValidMinutes,
  minutesOf,
  timeControlById,
  timeControlId,
  timeControls,
  timing,
} from '../game/timeControl.ts'
import type { TimeControl, TimeControlId, Timing } from '../game/timeControl.ts'
import { t } from '../i18n/index.ts'
import { Avatar } from '../opponents/avatars/Avatar.tsx'
import { opponentById, opponents } from '../opponents/opponents.ts'
import type { OpponentId } from '../opponents/opponents.ts'
import { isPersonaId, personaIds } from '../opponents/personas.ts'
import type { PersonaId } from '../opponents/personas.ts'
import type { GameSetup } from '../state/gameReducer.ts'
import { resolveColor } from '../state/preferences.ts'
import type { ColorChoice } from '../state/preferences.ts'
import { useDialog } from './useDialog.ts'
import './NewGameDialog.css'

type NewGameDialogProps = {
  open: boolean
  /** Setup of the current game; preselected in the form. */
  initial: GameSetup
  /**
   * Colour preselected in the form. Kept apart from `initial.humanColor`
   * so a player who asked for "случайно" is offered it again rather than
   * the side the last roll gave them.
   */
  initialColor?: ColorChoice
  onStart: (setup: GameSetup, color: ColorChoice) => void
  onCancel: () => void
  /** Injectable for tests; decides the colour for "случайно". */
  rng?: () => number
}

export function NewGameDialog({
  open,
  initial,
  initialColor,
  onStart,
  onCancel,
  rng = Math.random,
}: NewGameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useDialog(dialogRef, open)

  return (
    <dialog
      ref={dialogRef}
      className="new-game"
      aria-labelledby="new-game-title"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      {open && (
        <NewGameForm
          initial={initial}
          initialColor={
            initialColor ??
            (initial.humanColor === 'both' ? 'white' : initial.humanColor)
          }
          onStart={onStart}
          onCancel={onCancel}
          rng={rng}
        />
      )}
    </dialog>
  )
}

type NewGameFormProps = Omit<NewGameDialogProps, 'open' | 'rng'> & {
  initialColor: ColorChoice
  rng: () => number
}

/** The time choice that is not a preset but two numbers of one's own. */
const OWN = 'own'

/** Offered in the own-time fields before anything has been typed there. */
const OWN_MINUTES = '15'
const OWN_INCREMENT = '10'

/** Mounted only while the dialog is open so the form resets every time. */
function NewGameForm({
  initial,
  initialColor,
  onStart,
  onCancel,
  rng,
}: NewGameFormProps) {
  const [opponentId, setOpponentId] = useState<OpponentId>(
    opponentById(initial.opponentId).id,
  )
  const [color, setColor] = useState<ColorChoice>(initialColor)
  const [started] = useState(() => startingTime(initial.timeControlId))
  const [timeChoice, setTimeChoice] = useState(started.choice)
  const [yours, setYours] = useState<Fields>(() => fieldsOf(started.own))
  const [theirs, setTheirs] = useState<Fields>(() => fieldsOf(started.opponent))
  const [split, setSplit] = useState(started.split)
  const errorId = useId()
  const versusComputer = opponentById(opponentId).kind === 'computer'
  const own = timeChoice === OWN
  const yoursOk = validity(yours)
  const theirsOk = split ? validity(theirs) : WHOLLY_VALID
  const ownOk = isValid(yoursOk) && isValid(theirsOk)

  function submit(e: FormEvent) {
    e.preventDefault()
    const mine = ownOk ? timingOf(yours) : null
    const control = own
      ? mine === null
        ? null
        : timeControlId(mine, split ? timingOf(theirs) : mine)
      : (timeChoice as TimeControlId)
    // The start button is disabled on bad numbers; Enter also lands here.
    if (control === null) return
    const setup: GameSetup = {
      // The dialog sets a game up; which game it is belongs to the navbar,
      // so it travels through untouched.
      variant: initial.variant,
      opponentId,
      // Two humans share the screen and there is no side to draw for.
      humanColor: versusComputer ? resolveColor(color, rng) : 'both',
      timeControlId: control,
    }
    onStart(setup, color)
  }

  return (
    <form className="new-game__form" onSubmit={submit}>
      <h2 id="new-game-title" className="new-game__title">
        {t.newGame.title}
      </h2>

      <div className="new-game__columns">
        <fieldset className="new-game__fieldset">
          <legend className="new-game__legend">{t.newGame.opponent}</legend>
          <div className="new-game__cards">
            {opponents.map((o) => (
              <label key={o.id} className="new-game__card">
                <input
                  type="radio"
                  name="opponent"
                  value={o.id}
                  checked={o.id === opponentId}
                  onChange={() => setOpponentId(o.id)}
                />
                <Avatar id={o.id} size={40} />
                <span className="new-game__card-text">
                  <span className="new-game__card-name">
                    {t.opponents[o.id].name}
                  </span>{' '}
                  <span className="new-game__card-tagline">
                    {t.opponents[o.id].tagline}
                  </span>
                </span>
                {isPersonaId(o.id) && <Strength id={o.id} />}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="new-game__side">
          {versusComputer && (
            <fieldset className="new-game__fieldset">
              <legend className="new-game__legend">
                {t.newGame.yourColor}
              </legend>
              <div className="new-game__colors">
                {(['white', 'black', 'random'] as const).map((choice) => (
                  <label key={choice} className="new-game__color">
                    <input
                      type="radio"
                      name="color"
                      value={choice}
                      checked={color === choice}
                      onChange={() => setColor(choice)}
                    />
                    <span>{t.newGame.colors[choice]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="new-game__fieldset">
            <legend className="new-game__legend">{t.newGame.time}</legend>
            <p className="new-game__hint">{t.newGame.timeHint}</p>
            <div className="new-game__times">
              {timeControls.map((control) => (
                <label key={control.id} className="new-game__time">
                  <input
                    type="radio"
                    name="time"
                    value={control.id}
                    checked={timeChoice === control.id}
                    onChange={() => setTimeChoice(control.id)}
                  />
                  <span className="new-game__time-text">
                    <span className="new-game__time-bank">
                      {bankOf(control)}
                    </span>{' '}
                    <span className="new-game__time-note">
                      {noteOf(control)}
                    </span>
                  </span>
                </label>
              ))}
              <label className="new-game__time">
                <input
                  type="radio"
                  name="time"
                  value={OWN}
                  checked={own}
                  onChange={() => setTimeChoice(OWN)}
                />
                <span className="new-game__time-text">
                  <span className="new-game__time-bank">
                    {t.newGame.ownTime}
                  </span>{' '}
                  <span className="new-game__time-note">
                    {t.newGame.ownTimeNote}
                  </span>
                </span>
              </label>
            </div>

            {own && (
              <div className="new-game__own">
                <label className="new-game__switch">
                  <input
                    type="checkbox"
                    checked={split}
                    onChange={(e) => {
                      // The second clock opens on the first, so turning the
                      // switch on alone changes nothing about the game.
                      if (e.target.checked) setTheirs(yours)
                      setSplit(e.target.checked)
                    }}
                  />
                  <span>{t.newGame.splitTime}</span>
                </label>
                <TimeFields
                  labels={
                    split
                      ? versusComputer
                        ? t.newGame.yours
                        : t.newGame.white
                      : {
                          minutes: t.newGame.minutes,
                          increment: t.newGame.increment,
                        }
                  }
                  fields={yours}
                  onChange={setYours}
                  valid={yoursOk}
                  errorId={errorId}
                />
                {split && (
                  <TimeFields
                    labels={versusComputer ? t.newGame.theirs : t.newGame.black}
                    fields={theirs}
                    onChange={setTheirs}
                    valid={theirsOk}
                    errorId={errorId}
                  />
                )}
                {!ownOk && (
                  <p id={errorId} className="new-game__error" role="alert">
                    {t.newGame.badTime(MAX_MINUTES, MAX_INCREMENT)}
                  </p>
                )}
              </div>
            )}
          </fieldset>
        </div>
      </div>

      <div className="new-game__actions">
        <button type="button" className="button" onClick={onCancel}>
          {t.newGame.cancel}
        </button>
        <button
          type="submit"
          className="button button--accent"
          disabled={own && !ownOk}
        >
          {t.newGame.start}
        </button>
      </div>
    </form>
  )
}

/** Five pips, one per persona, filled up to this opponent's place. */
function Strength({ id }: { id: PersonaId }) {
  const level = personaIds.indexOf(id) + 1
  return (
    <span
      className="new-game__strength"
      role="img"
      aria-label={t.newGame.strength(level, personaIds.length)}
    >
      {personaIds.map((persona, i) => (
        <span
          key={persona}
          className={`new-game__pip${i < level ? ' new-game__pip--on' : ''}`}
        />
      ))}
    </span>
  )
}

type Fields = { readonly minutes: string; readonly increment: string }

type TimeFieldsProps = {
  labels: { readonly minutes: string; readonly increment: string }
  fields: Fields
  onChange: (fields: Fields) => void
  /** Field by field, so a bad minute never marks a good increment. */
  valid: Validity
  errorId: string
}

/** One side's bank and increment, in minutes and seconds. */
function TimeFields({
  labels,
  fields,
  onChange,
  valid,
  errorId,
}: TimeFieldsProps) {
  return (
    <div className="new-game__pair">
      <label className="new-game__field">
        <span>{labels.minutes}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_MINUTES}
          step={1}
          value={fields.minutes}
          aria-invalid={!valid.minutes}
          aria-describedby={valid.minutes ? undefined : errorId}
          onChange={(e) => onChange({ ...fields, minutes: e.target.value })}
        />
      </label>
      <label className="new-game__field">
        <span>{labels.increment}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_INCREMENT}
          step={1}
          value={fields.increment}
          aria-invalid={!valid.increment}
          aria-describedby={valid.increment ? undefined : errorId}
          onChange={(e) => onChange({ ...fields, increment: e.target.value })}
        />
      </label>
    </div>
  )
}

/** A timing as the two fields show it; the defaults before anything is typed. */
function fieldsOf(side: Timing | undefined): Fields {
  if (side === undefined) {
    return { minutes: OWN_MINUTES, increment: OWN_INCREMENT }
  }
  return {
    minutes: String(minutesOf(side)),
    increment: String(incrementOf(side)),
  }
}

type Validity = { readonly minutes: boolean; readonly increment: boolean }

const WHOLLY_VALID: Validity = { minutes: true, increment: true }

function validity(fields: Fields): Validity {
  return {
    minutes: isValidMinutes(toNumber(fields.minutes)),
    increment: isValidIncrement(toNumber(fields.increment)),
  }
}

function isValid(valid: Validity): boolean {
  return valid.minutes && valid.increment
}

function timingOf(fields: Fields): Timing {
  return timing(toNumber(fields.minutes), toNumber(fields.increment))
}

/**
 * What the time fieldset opens on. A preset is checked as itself, anything
 * else fills the own fields, and an id we cannot play — one that reached
 * us from an old link or an older build — opens on the untimed game rather
 * than on a choice the form could not show.
 */
function startingTime(id: TimeControlId | undefined): {
  choice: string
  own: Timing | undefined
  opponent: Timing | undefined
  split: boolean
} {
  const nothing = {
    choice: 'none',
    own: undefined,
    opponent: undefined,
    split: false,
  }
  if (id === undefined) return nothing
  if (isPreset(id)) return { ...nothing, choice: id }
  let control: TimeControl
  try {
    control = timeControlById(id)
  } catch {
    return nothing
  }
  return {
    choice: OWN,
    own: control.own,
    opponent: control.opponent,
    split: isSplit(control),
  }
}

function bankOf(control: TimeControl): string {
  return control.id === 'none'
    ? t.timeControl.none.bank
    : t.timeControl.bank(minutesOf(control.own))
}

function noteOf(control: TimeControl): string {
  return control.id === 'none'
    ? t.timeControl.none.increment
    : t.timeControl.increment(incrementOf(control.own))
}

/** An empty field is no number at all, not a zero. */
function toNumber(value: string): number {
  const trimmed = value.trim()
  return trimmed === '' ? Number.NaN : Number(trimmed)
}
