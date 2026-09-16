import { useState } from 'react'
import { t } from '../i18n/index.ts'
import { isSoundOn, setSoundOn } from '../sound/sound.ts'
import './NavBar.css'

/** Games that are planned but not built yet; shown disabled. */
const upcoming = ['giveaway', 'corners'] as const

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

function Flip() {
  return (
    <svg {...iconProps}>
      <path d="m4 6 4-4 4 4" />
      <path d="m4 10 4 4 4-4" />
    </svg>
  )
}

function Speaker({ on }: { on: boolean }) {
  return (
    <svg {...iconProps}>
      <path d="M8 2 4.5 5.5H2v5h2.5L8 14z" />
      {on ? (
        <path d="M11 5.5a3.5 3.5 0 0 1 0 5" />
      ) : (
        <path d="m11 6 3.5 4M14.5 6 11 10" />
      )}
    </svg>
  )
}

type NavBarProps = {
  /** Turns the board round; missing where there is no board to turn. */
  onFlip?: () => void
}

export function NavBar({ onFlip }: NavBarProps) {
  const [sound, setSound] = useState(isSoundOn)

  function toggleSound() {
    const next = !sound
    setSound(next)
    setSoundOn(next)
  }

  return (
    <div className="navbar">
      <h1 className="navbar__brand">{t.brand}</h1>
      <nav className="navbar__nav" aria-label={t.nav.games}>
        <ul className="navbar__tabs">
          <li>
            <a
              className="navbar__tab navbar__tab--current"
              href="/"
              aria-current="page"
              // Already here; a real navigation would throw the game away.
              onClick={(e) => e.preventDefault()}
            >
              {t.nav.checkers}
            </a>
          </li>
          {upcoming.map((game) => (
            <li key={game}>
              <button type="button" className="navbar__tab" disabled>
                {t.nav[game]}
                <span className="navbar__soon">{t.nav.soon}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="navbar__tools">
        {onFlip && (
          <button
            type="button"
            className="button button--icon"
            onClick={onFlip}
            aria-label={t.controls.flip}
            title={t.controls.flip}
          >
            <Flip />
          </button>
        )}
        <button
          type="button"
          className="button button--icon"
          aria-pressed={sound}
          aria-label={sound ? t.sound.disable : t.sound.enable}
          title={sound ? t.sound.disable : t.sound.enable}
          onClick={toggleSound}
        >
          <Speaker on={sound} />
        </button>
      </div>
    </div>
  )
}
