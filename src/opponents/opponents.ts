export type OpponentKind = 'computer' | 'human'

export type OpponentId = 'kitten' | 'hare' | 'fox' | 'owl' | 'raven' | 'friend'

/** Identity only; names and taglines come from i18n at render time. */
export type Opponent = {
  readonly id: OpponentId
  readonly kind: OpponentKind
}

export const FRIEND_ID: OpponentId = 'friend'

/** Personas do not move yet (Phase 1); Phase 2 gives each a strength. */
export const opponents: ReadonlyArray<Opponent> = [
  { id: 'kitten', kind: 'computer' },
  { id: 'hare', kind: 'computer' },
  { id: 'fox', kind: 'computer' },
  { id: 'owl', kind: 'computer' },
  { id: 'raven', kind: 'computer' },
  { id: FRIEND_ID, kind: 'human' },
]

export function opponentById(id: string): Opponent {
  const found = opponents.find((o) => o.id === id)
  if (found === undefined) throw new Error(`unknown opponent: ${id}`)
  return found
}
