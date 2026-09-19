import { BOARD, EMPTY, WORDS } from './board.ts'

/*
 * Packed move: one int32, `from | to << 6`. Nothing else describes a move:
 * there are no captures, and the path of a jump chain is a matter for the
 * UI (`generateDetailed`), not for the position it leads to.
 */

export function packMove(from: number, to: number): number {
  return from | (to << 6)
}

export function moveFrom(move: number): number {
  return move & 63
}

export function moveTo(move: number): number {
  return move >>> 6
}

/**
 * Plays `move` for `side` on the loaded board, in place. The search undoes
 * it with `unmake`, which is the same swap the other way; nothing else
 * changes, so nothing else has to be remembered.
 */
export function make(move: number, side: number): void {
  const from = move & 63
  const to = move >>> 6
  BOARD[to] = BOARD[from]!
  BOARD[from] = EMPTY
  flip(side, from)
  flip(side, to)
}

export function unmake(move: number, side: number): void {
  const from = move & 63
  const to = move >>> 6
  BOARD[from] = BOARD[to]!
  BOARD[to] = EMPTY
  flip(side, from)
  flip(side, to)
}

/** Toggles `sq` in the side's bitboard words. */
function flip(side: number, sq: number): void {
  const word = side * 2 + (sq >> 5)
  WORDS[word] = WORDS[word]! ^ (1 << (sq & 31))
}
