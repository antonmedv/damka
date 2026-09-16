import { useEffect } from 'react'
import { t } from '../i18n/index.ts'
import './Controls.css'

type ControlsProps = {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** An earlier position is shown; offers a way back to the latest one. */
  reviewing?: boolean
  onToLive?: () => void
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

/** Line icons on a 16×16 box, taking the button's colour. */
const iconProps = {
  viewBox: '0 0 16 16',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function StepBack() {
  return (
    <svg {...iconProps}>
      <path d="M10 3 5 8l5 5" />
    </svg>
  )
}

function StepForward() {
  return (
    <svg {...iconProps}>
      <path d="m6 3 5 5-5 5" />
    </svg>
  )
}

function ToEnd() {
  return (
    <svg {...iconProps}>
      <path d="m4 3 5 5-5 5" />
      <path d="M12 3v10" />
    </svg>
  )
}

/** Toolbar over the move list: what it navigates sits right below it. */
export function Controls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  reviewing = false,
  onToLive,
}: ControlsProps) {
  // Ctrl/Cmd+Z undoes, with Shift redoes — unless the user is typing.
  // Physical key, not e.key: on a Russian layout the same key reads "я".
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ') return
      if (isTyping(e.target)) return
      if (e.shiftKey) {
        if (canRedo) onRedo()
      } else if (canUndo) {
        onUndo()
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canUndo, canRedo, onUndo, onRedo])

  return (
    <div className="controls">
      {reviewing ? (
        // Takes the title's place rather than joining the row: the way out of
        // review lands where the eye already is, and nothing else shifts.
        <button
          type="button"
          className="button button--accent controls__to-live"
          onClick={onToLive}
        >
          <ToEnd />
          {t.controls.toLive}
        </button>
      ) : (
        // The list itself carries the accessible name; this is its visual label.
        <span className="controls__title" aria-hidden="true">
          {t.moveList.title}
        </span>
      )}
      <div className="controls__steps">
        <button
          type="button"
          className="button button--icon"
          disabled={!canUndo}
          onClick={onUndo}
          aria-label={t.controls.undo}
          title={t.controls.undo}
        >
          <StepBack />
        </button>
        <button
          type="button"
          className="button button--icon"
          disabled={!canRedo}
          onClick={onRedo}
          aria-label={t.controls.redo}
          title={t.controls.redo}
        >
          <StepForward />
        </button>
      </div>
    </div>
  )
}
