import {
  bit,
  reverse32,
  squareFromName32,
  squareName32,
  lsb,
} from './bitboard.ts'

export const WHITE = 0
export const BLACK = 1

/**
 * Engine position. In the search these five numbers travel as plain
 * arguments and locals; this object shape is for the boundary only
 * (tests, adapter, fixtures).
 */
export type BitPosition = {
  readonly white: number
  readonly black: number
  /** Kings of both colours. */
  readonly kings: number
  readonly side: 0 | 1
  /** Consecutive plies in which only kings made quiet moves. */
  readonly plies: number
}

export function initialBitPosition(): BitPosition {
  return {
    white: 0x00000fff,
    black: 0xfff00000 | 0,
    kings: 0,
    side: WHITE,
    plies: 0,
  }
}

/**
 * Turns the board 180° and swaps colours, so the position is the same
 * game seen from the other side. Its own inverse.
 */
export function mirror(p: BitPosition): BitPosition {
  return {
    white: reverse32(p.black),
    black: reverse32(p.white),
    kings: reverse32(p.kings),
    side: p.side === WHITE ? BLACK : WHITE,
    plies: p.plies,
  }
}

/**
 * Position literal for tests and fixtures: `W:Wa1,Kc3:Bf6,Kh8` — side to
 * move, white pieces, black pieces; `K` marks a king. Either list may be
 * empty. A trailing `:N` sets the draw counter.
 */
export function parsePos(text: string): BitPosition {
  const parts = text.split(':')
  const [sideText, whiteText, blackText, pliesText] = parts
  if (parts.length < 3 || parts.length > 4) {
    throw new Error(`invalid position literal: ${text}`)
  }
  if (sideText !== 'W' && sideText !== 'B') {
    throw new Error(`invalid side: ${sideText}`)
  }
  if (!whiteText?.startsWith('W') || !blackText?.startsWith('B')) {
    throw new Error(`invalid position literal: ${text}`)
  }
  let white = 0
  let black = 0
  let kings = 0
  const place = (list: string, colour: 'white' | 'black'): void => {
    if (list === '') return
    for (const item of list.split(',')) {
      const king = item.startsWith('K')
      const sq = bit(squareFromName32(king ? item.slice(1) : item))
      if (((white | black) & sq) !== 0) {
        throw new Error(`square used twice: ${item}`)
      }
      if (colour === 'white') white |= sq
      else black |= sq
      if (king) kings |= sq
    }
  }
  place(whiteText.slice(1), 'white')
  place(blackText.slice(1), 'black')
  const plies = pliesText === undefined ? 0 : Number(pliesText)
  if (!Number.isInteger(plies) || plies < 0) {
    throw new Error(`invalid draw counter: ${pliesText}`)
  }
  return { white, black, kings, side: sideText === 'W' ? WHITE : BLACK, plies }
}

/** Canonical inverse of `parsePos`: squares in index order, kings marked. */
export function formatPos(p: BitPosition): string {
  const list = (pieces: number): string => {
    const names: string[] = []
    for (let rest = pieces; rest !== 0; rest &= rest - 1) {
      const sq = lsb(rest)
      names.push(
        ((p.kings >>> sq) & 1) !== 0
          ? `K${squareName32(sq)}`
          : squareName32(sq),
      )
    }
    return names.join(',')
  }
  const side = p.side === WHITE ? 'W' : 'B'
  const suffix = p.plies === 0 ? '' : `:${p.plies}`
  return `${side}:W${list(p.white)}:B${list(p.black)}${suffix}`
}
