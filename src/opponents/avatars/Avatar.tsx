import { useId } from 'react'
import type { OpponentId } from '../opponents.ts'
import { Fox } from './Fox.tsx'
import { Friend } from './Friend.tsx'
import { Hare } from './Hare.tsx'
import { Kitten } from './Kitten.tsx'
import { Owl } from './Owl.tsx'
import { Raven } from './Raven.tsx'

type AvatarProps = {
  id: OpponentId
  /** Accessible name; omit when the name is shown right next to it. */
  label?: string
  size?: number
}

const faces = {
  kitten: Kitten,
  hare: Hare,
  fox: Fox,
  owl: Owl,
  raven: Raven,
  friend: Friend,
} as const

/** The disc a persona sits on. Each hue is its own, so the faces are told
    apart at 40px, before any of the detail in them is legible. */
const discs: Record<OpponentId, string> = {
  kitten: '#4a3550',
  hare: '#2f4436',
  fox: '#23393d',
  owl: '#26304d',
  raven: '#222a3c',
  friend: '#75552a',
}

export function Avatar({ id, label, size = 48 }: AvatarProps) {
  const Face = faces[id]
  // useId puts colons in the id, which url(#...) cannot carry.
  const clip = `avatar-${useId().replaceAll(':', '')}`
  return (
    <svg
      className={`avatar avatar--${id}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <clipPath id={clip}>
        <circle cx="32" cy="32" r="32" />
      </clipPath>
      {/* Everything is drawn inside the disc, so a bust can run off it. */}
      <g clipPath={`url(#${clip})`}>
        <circle cx="32" cy="32" r="32" fill={discs[id]} />
        <Face />
      </g>
    </svg>
  )
}
