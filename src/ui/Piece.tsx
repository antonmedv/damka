import type { Color, PieceKind } from '../game/types.ts'
import './Piece.css'

type PieceProps = {
  color: Color
  kind: PieceKind
}

/** Decorative disc; the owning square carries the accessible label. */
export function Piece({ color, kind }: PieceProps) {
  return (
    <svg
      className={`piece piece--${color}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="var(--piece-fill)"
        stroke="var(--piece-rim)"
        strokeWidth="3"
      />
      <circle
        cx="50"
        cy="50"
        r="36"
        fill="none"
        stroke="var(--piece-line)"
        strokeWidth="2"
      />
      <circle
        cx="50"
        cy="50"
        r="27"
        fill="none"
        stroke="var(--piece-line)"
        strokeWidth="1.5"
      />
      <path
        d="M26 38 A30 30 0 0 1 74 38"
        fill="none"
        stroke="var(--piece-shine)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {kind === 'king' && (
        <path
          className="piece__crown"
          d="M30 63 L30 43 L41 53 L50 35 L59 53 L70 43 L70 63 Z"
        />
      )}
    </svg>
  )
}
