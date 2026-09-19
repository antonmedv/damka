import { describe, expect, it } from 'vitest'
import { squareFromName, squareName } from '../game/board.ts'
import {
  BLACK,
  BLACK_HOME,
  BLACK_MAN,
  BOARD,
  CORNER_DISTANCE,
  COUNT,
  DOWN,
  LEFT,
  MEN,
  NEIGHBOR,
  RIGHT,
  TARGET_DISTANCE,
  UP,
  WHITE,
  WHITE_HOME,
  WHITE_MAN,
  WORDS,
  countOn,
  distanceLeft,
  formatBoard,
  initialPosition,
  isStep,
  load,
  menAtHome,
  turned,
} from './board.ts'
import { parseCorners } from './position.ts'

const sq = squareFromName

describe('homes', () => {
  it('puts White on a1–c3 and Black on f6–h8', () => {
    expect(WHITE_HOME.map(squareName)).toEqual([
      'a1',
      'b1',
      'c1',
      'a2',
      'b2',
      'c2',
      'a3',
      'b3',
      'c3',
    ])
    expect(BLACK_HOME.map(squareName).sort()).toEqual(
      ['f6', 'g6', 'h6', 'f7', 'g7', 'h7', 'f8', 'g8', 'h8'].sort(),
    )
    expect(WHITE_HOME).toHaveLength(MEN)
  })

  it('turns the board round with `turned`', () => {
    expect(squareName(turned(sq('a1')))).toBe('h8')
    expect(squareName(turned(sq('c3')))).toBe('f6')
    expect(turned(turned(17))).toBe(17)
  })
})

describe('NEIGHBOR', () => {
  it('steps one square and falls off the edge', () => {
    const d4 = sq('d4')
    expect(squareName(NEIGHBOR[d4 * 4 + LEFT]!)).toBe('c4')
    expect(squareName(NEIGHBOR[d4 * 4 + RIGHT]!)).toBe('e4')
    expect(squareName(NEIGHBOR[d4 * 4 + DOWN]!)).toBe('d3')
    expect(squareName(NEIGHBOR[d4 * 4 + UP]!)).toBe('d5')
    expect(NEIGHBOR[sq('a1') * 4 + LEFT]).toBe(-1)
    expect(NEIGHBOR[sq('a1') * 4 + DOWN]).toBe(-1)
    expect(NEIGHBOR[sq('h8') * 4 + RIGHT]).toBe(-1)
    expect(NEIGHBOR[sq('h8') * 4 + UP]).toBe(-1)
  })
})

describe('isStep', () => {
  it('tells a step from a jump', () => {
    expect(isStep(sq('d4'), sq('e4'))).toBe(true)
    expect(isStep(sq('d4'), sq('d3'))).toBe(true)
    expect(isStep(sq('d4'), sq('f4'))).toBe(false)
    expect(isStep(sq('d4'), sq('d6'))).toBe(false)
    // A diagonal is neither; the generator never offers one.
    expect(isStep(sq('d4'), sq('e5'))).toBe(false)
  })
})

describe('distances', () => {
  it('measures the walk to the nearest target square', () => {
    expect(TARGET_DISTANCE[WHITE * 64 + sq('a1')]).toBe(10)
    expect(TARGET_DISTANCE[WHITE * 64 + sq('e5')]).toBe(2)
    expect(TARGET_DISTANCE[WHITE * 64 + sq('f6')]).toBe(0)
    expect(TARGET_DISTANCE[WHITE * 64 + sq('h8')]).toBe(0)
    expect(TARGET_DISTANCE[BLACK * 64 + sq('h8')]).toBe(10)
    expect(TARGET_DISTANCE[BLACK * 64 + sq('c3')]).toBe(0)
  })

  it('is the same picture for both sides, turned round', () => {
    for (let s = 0; s < 64; s++) {
      expect(TARGET_DISTANCE[BLACK * 64 + s]).toBe(
        TARGET_DISTANCE[WHITE * 64 + turned(s)],
      )
      expect(CORNER_DISTANCE[BLACK * 64 + s]).toBe(
        CORNER_DISTANCE[WHITE * 64 + turned(s)],
      )
    }
  })

  it('counts depth inside the target only', () => {
    expect(CORNER_DISTANCE[WHITE * 64 + sq('h8')]).toBe(0)
    expect(CORNER_DISTANCE[WHITE * 64 + sq('f6')]).toBe(4)
    expect(CORNER_DISTANCE[WHITE * 64 + sq('g7')]).toBe(2)
    expect(CORNER_DISTANCE[WHITE * 64 + sq('e5')]).toBe(0)
  })

  it('sums what a side has left', () => {
    const start = initialPosition()
    // Nine men at distances 10, 9, 9, 8, 8, 8, 7, 7, 6.
    expect(distanceLeft(start, 'white')).toBe(72)
    expect(distanceLeft(start, 'black')).toBe(72)
    expect(distanceLeft(parseCorners('W:Wf6,g7:Bd4'), 'white')).toBe(0)
    expect(distanceLeft(parseCorners('W:Wf6,g7:Bd4'), 'black')).toBe(2)
  })
})

describe('load', () => {
  it('fills the cells, the words and the counts', () => {
    load(parseCorners('B:Wa1,h4:Bh8,a5'))
    expect(BOARD[sq('a1')]).toBe(WHITE_MAN)
    expect(BOARD[sq('h4')]).toBe(WHITE_MAN)
    expect(BOARD[sq('h8')]).toBe(BLACK_MAN)
    expect(BOARD[sq('a5')]).toBe(BLACK_MAN)
    expect(BOARD[sq('d4')]).toBe(0)
    expect(WORDS[0]).toBe((1 << 0) | (1 << 31))
    expect(WORDS[1]).toBe(0)
    expect(WORDS[2]).toBe(0)
    expect(WORDS[3]).toBe((1 << 31) | (1 << 0))
    expect(COUNT[WHITE]).toBe(2)
    expect(COUNT[BLACK]).toBe(2)
  })

  it('lists the men of a colour still in their own home', () => {
    const position = parseCorners('W:Wa1,c3,d4:Bh8,c1')
    expect(menAtHome(position, 'white').map(squareName)).toEqual(['a1', 'c3'])
    // Black's man in White's home is in its target, not at home.
    expect(menAtHome(position, 'black').map(squareName)).toEqual(['h8'])
    expect(menAtHome(parseCorners('W:Wd4:Bd5'), 'white')).toEqual([])
  })

  it('counts men on a set of squares', () => {
    load(initialPosition())
    expect(countOn(WHITE_HOME, WHITE_MAN)).toBe(9)
    expect(countOn(WHITE_HOME, BLACK_MAN)).toBe(0)
    expect(countOn(BLACK_HOME, BLACK_MAN)).toBe(9)
  })
})

describe('formatBoard', () => {
  it('draws the opening with white at the bottom', () => {
    expect(formatBoard(initialPosition())).toBe(
      [
        '  a b c d e f g h',
        '8 . . . . . x x x 8',
        '7 . . . . . x x x 7',
        '6 . . . . . x x x 6',
        '5 . . . . . . . . 5',
        '4 . . . . . . . . 4',
        '3 o o o . . . . . 3',
        '2 o o o . . . . . 2',
        '1 o o o . . . . . 1',
        '  a b c d e f g h',
      ].join('\n'),
    )
  })
})
