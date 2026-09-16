/** Linear undo/redo timeline: [...past, present, ...future]. */
export type History<T> = {
  readonly past: ReadonlyArray<T>
  readonly present: T
  readonly future: ReadonlyArray<T>
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

/** Advance to `next`; anything previously undone is discarded. */
export function push<T>(h: History<T>, next: T): History<T> {
  return { past: [...h.past, h.present], present: next, future: [] }
}

export function undo<T>(h: History<T>): History<T> {
  const present = h.past[h.past.length - 1]
  if (present === undefined) return h
  return {
    past: h.past.slice(0, -1),
    present,
    future: [h.present, ...h.future],
  }
}

export function redo<T>(h: History<T>): History<T> {
  const present = h.future[0]
  if (present === undefined) return h
  return {
    past: [...h.past, h.present],
    present,
    future: h.future.slice(1),
  }
}

/** Make timeline entry `index` the present (clamped to the timeline). */
export function jumpTo<T>(h: History<T>, index: number): History<T> {
  const timeline = [...h.past, h.present, ...h.future]
  const i = Math.max(0, Math.min(index, timeline.length - 1))
  const present = timeline[i]
  if (present === undefined || i === h.past.length) return h
  return {
    past: timeline.slice(0, i),
    present,
    future: timeline.slice(i + 1),
  }
}
