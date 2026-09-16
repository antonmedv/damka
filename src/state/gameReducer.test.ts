import { describe, expect, it } from 'vitest'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { pieceAt, squareFromName } from '../game/board.ts'
import { formatMove } from '../game/notation.ts'
import { legalMoves } from '../game/moves.ts'
import { timeControlById } from '../game/timeControl.ts'
import { MATE_BOUND } from '../engine/score.ts'
import { DB_DRAW_BAND, DB_WIN, DB_WIN_MIN } from '../engine/db.ts'
import {
  canRedoGame,
  canUndoGame,
  clockView,
  computerToMove,
  currentOffer,
  currentPosition,
  finalAgreed,
  finalOutcome,
  displayPosition,
  gameReducer,
  initialState,
  lastMove,
  movable,
  outcome,
  selectedSquare,
  statusOf,
  targets,
} from './gameReducer.ts'
import type { GameState } from './gameReducer.ts'
import { createHistory } from './history.ts'

const sq = squareFromName

/** A two-human game whose current position is the literal. */
function stateAt(literal: string): GameState {
  return {
    ...initialState({ opponentId: 'friend', humanColor: 'both' }),
    history: createHistory(fromBitPosition(parsePos(literal))),
  }
}

/** Two humans, so undo and redo move one ply at a time. */
function twoHumans(): GameState {
  return initialState({ opponentId: 'friend', humanColor: 'both' })
}

function tapAll(state: GameState, ...squares: string[]): GameState {
  return squares.reduce(
    (s, name) => gameReducer(s, { type: 'tap', square: sq(name) }),
    state,
  )
}

function play(state: GameState, ...moves: [string, string][]): GameState {
  return moves.reduce(
    (s, [from, to]) =>
      gameReducer(s, { type: 'move', from: sq(from), to: sq(to) }),
    state,
  )
}

describe('gameReducer: selection', () => {
  it('selects a piece of the side to move', () => {
    const s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    expect(s.selected).toBe(sq('c3'))
    expect(targets(s)).toContain(sq('d4'))
  })

  it('ignores a tap on the opponent piece when nothing is selected', () => {
    const s = gameReducer(initialState(), { type: 'tap', square: sq('f6') })
    expect(s.selected).toBeNull()
  })

  it('ignores a tap on an empty square when nothing is selected', () => {
    const s = gameReducer(initialState(), { type: 'tap', square: sq('d4') })
    expect(s.selected).toBeNull()
  })

  it('tapping the selected piece again deselects it', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'tap', square: sq('c3') })
    expect(s.selected).toBeNull()
  })

  it('tapping another own piece switches the selection', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'tap', square: sq('e3') })
    expect(s.selected).toBe(sq('e3'))
  })

  it('tapping a non-target square deselects', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'tap', square: sq('f6') })
    expect(s.selected).toBeNull()
  })

  it('deselect clears the selection', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'deselect' })
    expect(s.selected).toBeNull()
  })

  it('has no targets when nothing is selected', () => {
    expect(targets(initialState())).toEqual([])
  })
})

describe('gameReducer: moving', () => {
  it('tapping a target completes the move and passes the turn', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'tap', square: sq('d4') })
    expect(pieceAt(currentPosition(s).board, sq('d4'))?.color).toBe('white')
    expect(currentPosition(s).toMove).toBe('black')
    expect(s.selected).toBeNull()
    expect(s.moves).toEqual([
      {
        from: sq('c3'),
        to: sq('d4'),
        captures: [],
        promotes: false,
        path: [sq('d4')],
      },
    ])
    expect(lastMove(s)).toEqual(s.moves[0])
  })

  it('move action moves directly (used by drag)', () => {
    const s = play(initialState(), ['c3', 'd4'])
    expect(pieceAt(currentPosition(s).board, sq('c3'))).toBeUndefined()
    expect(s.moves).toHaveLength(1)
  })

  it('ignores a move to a square that is not a target', () => {
    const before = initialState()
    const after = gameReducer(before, {
      type: 'move',
      from: sq('c3'),
      to: sq('e3'),
    })
    expect(after).toBe(before)
  })

  it('ignores a move by the side not to move', () => {
    const before = initialState()
    const after = gameReducer(before, {
      type: 'move',
      from: sq('f6'),
      to: sq('e5'),
    })
    expect(after).toBe(before)
  })

  it('has no last move before the first move', () => {
    expect(lastMove(initialState())).toBeNull()
  })
})

describe('gameReducer: undo / redo', () => {
  it('undo restores the previous position and keeps the move for redo', () => {
    const played = play(twoHumans(), ['c3', 'd4'], ['f6', 'e5'])
    const s = gameReducer(played, { type: 'undo' })
    expect(currentPosition(s).toMove).toBe('black')
    expect(pieceAt(currentPosition(s).board, sq('f6'))?.color).toBe('black')
    expect(s.moves).toHaveLength(2)
    expect(lastMove(s)).toEqual(s.moves[0])
  })

  it('redo replays the undone move', () => {
    const played = play(twoHumans(), ['c3', 'd4'], ['f6', 'e5'])
    const s = gameReducer(gameReducer(played, { type: 'undo' }), {
      type: 'redo',
    })
    expect(currentPosition(s)).toEqual(currentPosition(played))
    expect(lastMove(s)).toEqual(s.moves[1])
  })

  it('a new move after undo discards the undone future', () => {
    const played = play(twoHumans(), ['c3', 'd4'], ['f6', 'e5'])
    const s = play(gameReducer(played, { type: 'undo' }), ['d6', 'c5'])
    expect(s.moves.map((m) => m.from)).toEqual([sq('c3'), sq('d6')])
    expect(s.history.future).toEqual([])
  })

  it('undo clears the selection', () => {
    const played = play(twoHumans(), ['c3', 'd4'])
    const selected = gameReducer(played, { type: 'tap', square: sq('f6') })
    expect(gameReducer(selected, { type: 'undo' }).selected).toBeNull()
  })

  it('undo at the start and redo at the end are no-ops', () => {
    const s = initialState()
    expect(gameReducer(s, { type: 'undo' })).toBe(s)
    expect(gameReducer(s, { type: 'redo' })).toBe(s)
  })
})

describe('gameReducer: select (drag start)', () => {
  it('selects an own piece and keeps it selected when repeated', () => {
    let s = gameReducer(initialState(), { type: 'select', square: sq('c3') })
    expect(s.selected).toBe(sq('c3'))
    s = gameReducer(s, { type: 'select', square: sq('c3') })
    expect(s.selected).toBe(sq('c3'))
  })

  it('ignores pieces of the side not to move and empty squares', () => {
    const before = initialState()
    expect(gameReducer(before, { type: 'select', square: sq('f6') })).toBe(
      before,
    )
    expect(gameReducer(before, { type: 'select', square: sq('d4') })).toBe(
      before,
    )
  })
})

describe('gameReducer: slide animation hint', () => {
  it('asks for a slide after a tap move', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'tap', square: sq('d4') })
    expect(s.slide).toEqual({ from: sq('c3'), path: [sq('d4')] })
  })

  it('does not slide after a direct (drag) move', () => {
    const s = play(initialState(), ['c3', 'd4'])
    expect(s.slide).toBeNull()
  })

  it('clears the slide on undo and redo', () => {
    let s = gameReducer(initialState(), { type: 'tap', square: sq('c3') })
    s = gameReducer(s, { type: 'tap', square: sq('d4') })
    const undone = gameReducer(s, { type: 'undo' })
    expect(undone.slide).toBeNull()
    expect(gameReducer(undone, { type: 'redo' }).slide).toBeNull()
  })
})

describe('gameReducer: jumpTo (review)', () => {
  const played = play(twoHumans(), ['c3', 'd4'], ['f6', 'g5'], ['e3', 'f4'])

  it('shows the position after the chosen number of moves', () => {
    const s = gameReducer(played, { type: 'jumpTo', index: 1 })
    expect(pieceAt(currentPosition(s).board, sq('d4'))?.color).toBe('white')
    expect(pieceAt(currentPosition(s).board, sq('f6'))?.color).toBe('black')
    expect(s.history.past).toHaveLength(1)
    expect(s.history.future).toHaveLength(2)
    expect(s.moves).toHaveLength(3)
  })

  it('index 0 is the starting position', () => {
    const s = gameReducer(played, { type: 'jumpTo', index: 0 })
    expect(currentPosition(s)).toEqual(initialState().history.present)
    expect(lastMove(s)).toBeNull()
  })

  it('clears selection and slide hint', () => {
    let s = gameReducer(played, { type: 'tap', square: sq('d6') })
    s = gameReducer(s, { type: 'jumpTo', index: 2 })
    expect(s.selected).toBeNull()
    expect(s.slide).toBeNull()
  })

  it('a move from a reviewed position starts a new line', () => {
    const reviewed = gameReducer(played, { type: 'jumpTo', index: 1 })
    const s = play(reviewed, ['d6', 'c5'])
    expect(s.moves.map((m) => m.from)).toEqual([sq('c3'), sq('d6')])
    expect(s.history.future).toEqual([])
  })
})

describe('gameReducer: newGame and flipBoard', () => {
  it('newGame resets everything and orients the board to the human colour', () => {
    const played = play(initialState(), ['c3', 'd4'], ['f6', 'e5'])
    const s = gameReducer(played, {
      type: 'newGame',
      setup: { opponentId: 'fox', humanColor: 'black' },
    })
    expect(s.moves).toEqual([])
    expect(s.history.past).toEqual([])
    expect(s.history.future).toEqual([])
    expect(currentPosition(s)).toEqual(initialState().history.present)
    expect(s.selected).toBeNull()
    expect(s.orientation).toBe('black')
    expect(s.setup).toEqual({ opponentId: 'fox', humanColor: 'black' })
  })

  it('white always moves first regardless of the human colour', () => {
    const s = initialState({ opponentId: 'fox', humanColor: 'black' })
    expect(currentPosition(s).toMove).toBe('white')
  })

  it('two humans start with white at the bottom', () => {
    expect(
      initialState({ opponentId: 'friend', humanColor: 'both' }).orientation,
    ).toBe('white')
  })

  it('flipBoard toggles the orientation and keeps the game', () => {
    const played = play(initialState(), ['c3', 'd4'])
    const flipped = gameReducer(played, { type: 'flipBoard' })
    expect(flipped.orientation).toBe('black')
    expect(flipped.moves).toEqual(played.moves)
    expect(gameReducer(flipped, { type: 'flipBoard' }).orientation).toBe(
      'white',
    )
  })
})

describe('gameReducer: rules', () => {
  it('only pieces with a legal move can be selected', () => {
    const s = stateAt('W:Wc3,a1:Bd4')
    expect(movable(s)).toEqual([sq('c3')])
    expect(
      gameReducer(s, { type: 'tap', square: sq('a1') }).selected,
    ).toBeNull()
    expect(gameReducer(s, { type: 'select', square: sq('a1') })).toBe(s)
  })

  it('a capture is mandatory and removes the captured piece', () => {
    let s = tapAll(stateAt('W:Wc3,a1:Bd4'), 'c3')
    expect(targets(s)).toEqual([sq('e5')])
    s = gameReducer(s, { type: 'tap', square: sq('e5') })
    const position = currentPosition(s)
    expect(pieceAt(position.board, sq('d4'))).toBeUndefined()
    expect(pieceAt(position.board, sq('e5'))?.color).toBe('white')
    expect(position.toMove).toBe('black')
    expect(s.moves.map(formatMove)).toEqual(['c3:e5'])
  })

  it('an unambiguous multiple capture is played from one tap on any of its squares', () => {
    const start = tapAll(stateAt('W:Wc3:Bd4,d6'), 'c3')
    expect(targets(start).sort()).toEqual([sq('e5'), sq('c7')].sort())
    for (const square of ['e5', 'c7']) {
      const s = gameReducer(start, { type: 'tap', square: sq(square) })
      expect(s.moves.map(formatMove)).toEqual(['c3:e5:c7'])
      expect(s.steps).toEqual([])
      expect(pieceAt(currentPosition(s).board, sq('d6'))).toBeUndefined()
    }
  })

  it('a man promotes on the back rank', () => {
    const s = tapAll(stateAt('W:Wa7:B'), 'a7', 'b8')
    expect(s.moves[0]?.promotes).toBe(true)
    expect(pieceAt(currentPosition(s).board, sq('b8'))?.kind).toBe('king')
  })
})

describe('gameReducer: entering an ambiguous capture', () => {
  // Four black men around d2 plus g3: two loops end on d2, two paths end
  // on h2, so neither final square identifies a move at the start.
  const FIVE = 'W:Wd2:Bc3,e3,c5,e5,g3'

  it('offers only the next landing squares while finals are ambiguous', () => {
    const s = tapAll(stateAt(FIVE), 'd2')
    expect(targets(s).sort()).toEqual([sq('b4'), sq('f4')].sort())
  })

  it('keeps the piece in the air and shows it on its landing square', () => {
    const s = tapAll(stateAt(FIVE), 'd2', 'b4')
    expect(s.moves).toEqual([])
    // Both loops through b4 go on over c5 to d6 and over e5 to f4; the
    // piece takes those forced jumps at once and stops where they part.
    expect(s.steps).toEqual([sq('b4'), sq('d6'), sq('f4')])
    expect(selectedSquare(s)).toBe(sq('f4'))
    const shown = displayPosition(s)
    expect(pieceAt(shown.board, sq('f4'))?.color).toBe('white')
    expect(pieceAt(shown.board, sq('d2'))).toBeUndefined()
    // The captured men stay on the board until the move is complete.
    expect(pieceAt(shown.board, sq('c3'))?.color).toBe('black')
    expect(pieceAt(shown.board, sq('e5'))?.color).toBe('black')
    expect(pieceAt(currentPosition(s).board, sq('d2'))?.color).toBe('white')
    expect(movable(s)).toEqual([sq('f4')])
    // Only the last jump is left to choose, and each final says which.
    expect(targets(s).sort()).toEqual([sq('d2'), sq('h2')].sort())
  })

  it('flies the piece over the forced jumps it took by itself', () => {
    const s = tapAll(stateAt(FIVE), 'd2', 'b4')
    expect(s.slide).toEqual({
      from: sq('d2'),
      path: [sq('b4'), sq('d6'), sq('f4')],
    })
  })

  it('flies only the jumps a drag did not carry the piece over', () => {
    const s = gameReducer(tapAll(stateAt(FIVE), 'd2'), {
      type: 'move',
      from: sq('d2'),
      to: sq('b4'),
    })
    expect(s.steps).toEqual([sq('b4'), sq('d6'), sq('f4')])
    expect(s.slide).toEqual({ from: sq('b4'), path: [sq('d6'), sq('f4')] })
  })

  it('finishes the move on the jump that tells the loops apart', () => {
    const s = tapAll(stateAt(FIVE), 'd2', 'b4', 'h2')
    expect(s.moves.map(formatMove)).toEqual(['d2:b4:d6:f4:h2'])
    expect(s.steps).toEqual([])
    const board = currentPosition(s).board
    for (const name of ['c3', 'c5', 'e5', 'g3', 'd2']) {
      expect(pieceAt(board, sq(name))).toBeUndefined()
    }
    expect(pieceAt(board, sq('e3'))?.color).toBe('black')
    expect(pieceAt(board, sq('h2'))?.color).toBe('white')
  })

  it('finishes early on a final square once it is unambiguous', () => {
    const s = tapAll(stateAt(FIVE), 'd2', 'b4', 'd2')
    expect(s.moves.map(formatMove)).toEqual(['d2:b4:d6:f4:d2'])
    // The piece is already on f4: only the last leg is left to fly.
    expect(s.slide).toEqual({ from: sq('f4'), path: [sq('d2')] })
  })

  it('flies a whole capture entered with one tap on its final square', () => {
    const s = tapAll(stateAt('W:Wc3:Bd4,d6'), 'c3', 'c7')
    expect(s.moves.map(formatMove)).toEqual(['c3:e5:c7'])
    expect(s.slide).toEqual({ from: sq('c3'), path: [sq('e5'), sq('c7')] })
  })

  it('abandons the capture on any other tap', () => {
    const s = tapAll(stateAt(FIVE), 'd2', 'b4', 'a1')
    expect(s.selected).toBeNull()
    expect(s.steps).toEqual([])
    expect(s.moves).toEqual([])
    expect(displayPosition(s)).toBe(currentPosition(s))
  })

  it('a tap on another piece switches to it in one tap', () => {
    // a5 has its own single capture (a5:c7) that does not touch the d2 loops.
    const s = tapAll(stateAt('W:Wd2,a5:Bc3,e3,c5,e5,g3,b6'), 'd2', 'b4', 'a5')
    expect(s.selected).toBe(sq('a5'))
    expect(s.steps).toEqual([])
    expect(targets(s)).toEqual([sq('c7')])
  })

  it('shows a man that crossed the back rank as a king', () => {
    // d6:f8 promotes; the new king must go on over g7 to h6 and then over
    // f4 to any of e3, d2, c1, so the entry pauses on h6.
    const s = tapAll(stateAt('W:Wd6:Be7,g7,f4'), 'd6', 'f8')
    expect(s.steps).toEqual([sq('f8'), sq('h6')])
    expect(pieceAt(displayPosition(s).board, sq('h6'))).toEqual({
      color: 'white',
      kind: 'king',
    })
    expect(pieceAt(currentPosition(s).board, sq('d6'))?.kind).toBe('man')
    const done = tapAll(s, 'c1')
    expect(done.moves.map(formatMove)).toEqual(['d6:f8:h6:c1'])
  })

  it('continues a drag from the landing square', () => {
    let s = tapAll(stateAt(FIVE), 'd2', 'b4')
    expect(gameReducer(s, { type: 'select', square: sq('f4') })).toBe(s)
    s = gameReducer(s, { type: 'move', from: sq('f4'), to: sq('h2') })
    expect(s.moves.map(formatMove)).toEqual(['d2:b4:d6:f4:h2'])
    expect(s.slide).toBeNull()
  })

  it('a drag from the origin restarts the entry', () => {
    let s = tapAll(stateAt(FIVE), 'd2', 'b4')
    s = gameReducer(s, { type: 'move', from: sq('d2'), to: sq('f4') })
    expect(s.steps).toEqual([sq('f4')])
  })

  it('undo, redo and deselect clear a capture in progress', () => {
    const s = tapAll(stateAt(FIVE), 'd2', 'b4')
    expect(gameReducer(s, { type: 'deselect' }).steps).toEqual([])
    expect(gameReducer(s, { type: 'jumpTo', index: 0 }).steps).toEqual([])
  })
})

describe('gameReducer: game over', () => {
  it('reports the result and ignores input', () => {
    const lost = stateAt('W:Wa1:Bb2,c3')
    expect(statusOf(lost)).toBe('blackWins')
    expect(movable(lost)).toEqual([])
    expect(gameReducer(lost, { type: 'tap', square: sq('a1') })).toBe(lost)

    const drawn = stateAt('W:WKa1:BKh8:30')
    expect(statusOf(drawn)).toBe('draw')
    expect(movable(drawn)).toEqual([])
    expect(gameReducer(drawn, { type: 'tap', square: sq('a1') })).toBe(drawn)
    expect(
      gameReducer(drawn, { type: 'move', from: sq('a1'), to: sq('b2') }),
    ).toBe(drawn)
  })

  it('a capture that leaves the opponent without pieces wins', () => {
    const s = tapAll(stateAt('W:Wc3:Bd4'), 'c3', 'e5')
    expect(statusOf(s)).toBe('whiteWins')
  })

  it('counts quiet king plies towards the draw', () => {
    // Kings on c1 and f8 never see each other, so no capture interferes.
    let s = tapAll(stateAt('W:WKc1,h2:BKf8,a7:28'), 'c1', 'd2')
    expect(currentPosition(s).drawCounter).toBe(29)
    expect(statusOf(s)).toBe('ongoing')
    s = tapAll(s, 'f8', 'e7')
    expect(currentPosition(s).drawCounter).toBe(30)
    expect(statusOf(s)).toBe('draw')
  })
})

describe('gameReducer: computer opponent', () => {
  const vsHare = (humanColor: 'white' | 'black'): GameState =>
    initialState({ opponentId: 'hare', humanColor })
  const hotSeat = (): GameState =>
    initialState({ opponentId: 'friend', humanColor: 'both' })
  const reply = (state: GameState) => legalMoves(currentPosition(state))[0]!
  const thinkingAfterMove = (): GameState =>
    gameReducer(play(vsHare('white'), ['c3', 'd4']), { type: 'think', id: 1 })

  it('wants a move only on the persona turn in a live, ongoing game', () => {
    expect(computerToMove(vsHare('white'))).toBe(false)
    expect(computerToMove(vsHare('black'))).toBe(true)
    const moved = play(vsHare('white'), ['c3', 'd4'])
    expect(computerToMove(moved)).toBe(true)
    expect(
      computerToMove(gameReducer(moved, { type: 'jumpTo', index: 0 })),
    ).toBe(false)
    expect(computerToMove(hotSeat())).toBe(false)
    expect(computerToMove({ ...vsHare('black'), ...stateAt('B:Wc3:B') })).toBe(
      false,
    )
  })

  it('blocks input while a request is pending', () => {
    const s = thinkingAfterMove()
    expect(s.thinking).toBe(1)
    expect(movable(s)).toEqual([])
    expect(
      gameReducer(s, { type: 'tap', square: sq('f6') }).selected,
    ).toBeNull()
    expect(gameReducer(s, { type: 'select', square: sq('f6') })).toBe(s)
    expect(gameReducer(s, { type: 'move', from: sq('f6'), to: sq('e5') })).toBe(
      s,
    )
  })

  it('plays the reply to the pending request with a slide and clears it', () => {
    const s = thinkingAfterMove()
    const move = reply(s)
    const after = gameReducer(s, { type: 'computerMove', id: 1, move })
    expect(after.thinking).toBeNull()
    expect(after.moves).toHaveLength(2)
    expect(lastMove(after)).toEqual(move)
    expect(after.slide).toEqual(move)
    expect(currentPosition(after).toMove).toBe('white')
  })

  it('drops a reply with a stale id and one with an illegal move', () => {
    const s = thinkingAfterMove()
    expect(
      gameReducer(s, { type: 'computerMove', id: 7, move: reply(s) }),
    ).toBe(s)
    const illegal = { ...reply(s), to: sq('a1'), path: [sq('a1')] }
    const after = gameReducer(s, { type: 'computerMove', id: 1, move: illegal })
    expect(after.thinking).toBeNull()
    expect(after.moves).toHaveLength(1)
  })

  it('forgets the pending request on undo, jumpTo and newGame', () => {
    const s = thinkingAfterMove()
    expect(gameReducer(s, { type: 'undo' }).thinking).toBeNull()
    expect(gameReducer(s, { type: 'jumpTo', index: 0 }).thinking).toBeNull()
    expect(
      gameReducer(s, { type: 'newGame', setup: s.setup }).thinking,
    ).toBeNull()
  })

  it('undo takes back the reply with the human move; redo steps forward one ply', () => {
    let s = thinkingAfterMove()
    s = gameReducer(s, { type: 'computerMove', id: 1, move: reply(s) })
    expect(canUndoGame(s)).toBe(true)
    const undone = gameReducer(s, { type: 'undo' })
    expect(undone.history.past).toHaveLength(0)
    expect(currentPosition(undone).toMove).toBe('white')
    expect(canRedoGame(undone)).toBe(true)
    const once = gameReducer(undone, { type: 'redo' })
    expect(once.history.past).toHaveLength(1)
    expect(computerToMove(once)).toBe(false)
    const twice = gameReducer(once, { type: 'redo' })
    expect(twice.history.past).toHaveLength(2)
    expect(canRedoGame(twice)).toBe(false)
  })

  it('steps one ply at a time while reviewing, so every position is reachable', () => {
    let s = thinkingAfterMove()
    s = gameReducer(s, { type: 'computerMove', id: 1, move: reply(s) })
    s = play(s, ['e3', 'f4'])
    s = gameReducer(s, { type: 'think', id: 2 })
    s = gameReducer(s, { type: 'computerMove', id: 2, move: reply(s) })
    expect(s.history.past).toHaveLength(4)
    const reviewed = gameReducer(s, { type: 'jumpTo', index: 1 })
    const back = gameReducer(reviewed, { type: 'undo' })
    expect(back.history.past).toHaveLength(0)
    const forth = gameReducer(back, { type: 'redo' })
    expect(forth.history.past).toHaveLength(1)
    expect(currentPosition(forth)).toBe(currentPosition(reviewed))
  })

  it('does not let the human move the persona pieces from a reviewed position', () => {
    let s = thinkingAfterMove()
    s = gameReducer(s, { type: 'computerMove', id: 1, move: reply(s) })
    const reviewed = gameReducer(s, { type: 'jumpTo', index: 1 })
    expect(currentPosition(reviewed).toMove).toBe('black')
    expect(movable(reviewed)).toEqual([])
    expect(
      gameReducer(reviewed, { type: 'tap', square: sq('f6') }).selected,
    ).toBeNull()
    expect(
      gameReducer(reviewed, { type: 'move', from: sq('f6'), to: sq('e5') }),
    ).toBe(reviewed)
  })

  it('thinkFailed clears only the matching request', () => {
    const s = thinkingAfterMove()
    expect(gameReducer(s, { type: 'thinkFailed', id: 9 })).toBe(s)
    const cleared = gameReducer(s, { type: 'thinkFailed', id: 1 })
    expect(cleared.thinking).toBeNull()
    expect(cleared.moves).toHaveLength(1)
  })

  it('undo with the persona to move takes back only the human move', () => {
    const undone = gameReducer(play(vsHare('white'), ['c3', 'd4']), {
      type: 'undo',
    })
    expect(undone.history.past).toHaveLength(0)
    expect(currentPosition(undone).toMove).toBe('white')
  })

  it('cannot undo the lone opening move of the persona', () => {
    let s = gameReducer(vsHare('black'), { type: 'think', id: 1 })
    s = gameReducer(s, { type: 'computerMove', id: 1, move: reply(s) })
    expect(canUndoGame(s)).toBe(false)
    expect(gameReducer(s, { type: 'undo' })).toBe(s)
  })

  it('two humans undo and redo one move at a time', () => {
    const s = play(hotSeat(), ['c3', 'd4'], ['f6', 'g5'])
    const undone = gameReducer(s, { type: 'undo' })
    expect(undone.history.past).toHaveLength(1)
    expect(gameReducer(undone, { type: 'redo' }).history.past).toHaveLength(2)
  })
})

// --- the clock ------------------------------------------------------------

/** Two humans on a 3 + 2 clock, started at `now`. */
function timed(now = 0): GameState {
  return initialState(
    { opponentId: 'friend', humanColor: 'both', timeControlId: '3+2' },
    undefined,
    now,
  )
}

/** One move by the side to move, stamped. */
function playAt(state: GameState, from: string, to: string, at: number) {
  return gameReducer(state, { type: 'move', from: sq(from), to: sq(to), at })
}

describe('gameReducer: clock', () => {
  it('leaves an untimed game without one', () => {
    expect(initialState().clock).toBe(null)
    expect(clockView(initialState(), 1000)).toBe(null)
    expect(outcome(initialState())).toBe('ongoing')
  })

  it('starts both banks and runs the side to move', () => {
    const s = timed(1000)
    const view = clockView(s, 6000)
    const control = timeControlById('3+2')
    expect(view).toEqual({
      control,
      timings: { white: control.own, black: control.opponent },
      remaining: { white: 175_000, black: 180_000 },
      running: 'white',
      flagged: null,
    })
  })

  it('gives each side the clock the control names', () => {
    const state = initialState(
      { opponentId: 'fox', humanColor: 'black', timeControlId: '10+5:1+0' },
      undefined,
      0,
    )
    const view = clockView(state, 0)
    // The human is black, so black holds the ten minutes.
    expect(view?.remaining).toEqual({ white: 60_000, black: 600_000 })
    // White moves first and is charged its own increment.
    const played = playAt(state, 'c3', 'd4', 1000)
    expect(clockView(played, 1000)?.remaining).toEqual({
      white: 59_000,
      black: 600_000,
    })
  })

  it('charges the mover and adds the increment', () => {
    const s = playAt(timed(0), 'c3', 'd4', 5000)
    expect(clockView(s, 5000)).toMatchObject({
      remaining: { white: 177_000, black: 180_000 },
      running: 'black',
    })
    // Now it is Black who is being charged.
    expect(clockView(s, 9000)?.remaining).toEqual({
      white: 177_000,
      black: 176_000,
    })
  })

  it('ignores a flag claim that is not true yet', () => {
    const s = timed(0)
    const claimed = gameReducer(s, { type: 'flag', color: 'white', at: 1000 })
    expect(claimed).toBe(s)
    expect(outcome(claimed)).toBe('ongoing')
  })

  it('ignores a flag claim against the side that is not on move', () => {
    const s = timed(0)
    expect(gameReducer(s, { type: 'flag', color: 'black', at: 999_000 })).toBe(
      s,
    )
  })

  it('ends the game when the side to move really is out', () => {
    const s = gameReducer(timed(0), {
      type: 'flag',
      color: 'white',
      at: 180_000,
    })
    expect(s.clock?.flagged).toEqual({ color: 'white', ply: 0 })
    expect(outcome(s)).toBe('blackWins')
    expect(statusOf(s)).toBe('ongoing')
    expect(clockView(s, 999_000)?.remaining.white).toBe(0)
    expect(movable(s)).toEqual([])
    expect(computerToMove(s)).toBe(false)
  })

  it('refuses a search asked for on the position before the flag', () => {
    const s = gameReducer(timed(0), {
      type: 'flag',
      color: 'white',
      at: 180_000,
    })
    expect(gameReducer(s, { type: 'think', id: 1 })).toBe(s)
    expect(s.thinking).toBe(null)
  })

  it('accepts a flag only once', () => {
    const flagged = gameReducer(timed(0), {
      type: 'flag',
      color: 'white',
      at: 180_000,
    })
    expect(
      gameReducer(flagged, { type: 'flag', color: 'black', at: 200_000 }),
    ).toBe(flagged)
  })

  it('flags instead of playing a move that lands too late', () => {
    const s = playAt(timed(0), 'c3', 'd4', 200_000)
    expect(s.moves).toEqual([])
    expect(outcome(s)).toBe('blackWins')
  })

  it('stops rather than charge from a moment an action did not carry', () => {
    const s = timed(1000)
    const moved = gameReducer(s, { type: 'move', from: sq('c3'), to: sq('d4') })
    // The move counts and the increment is given, but Black is not charged
    // for the time White spent: the clock waits for the next stamp.
    expect(moved.clock?.startedAt).toBe(null)
    expect(moved.clock?.times[1]).toEqual({ white: 182_000, black: 180_000 })
    expect(clockView(moved, 999_000)?.remaining).toEqual({
      white: 182_000,
      black: 180_000,
    })
  })

  it('gives the time back when a move is taken back', () => {
    let s = playAt(timed(0), 'c3', 'd4', 20_000)
    s = playAt(s, 'f6', 'e5', 40_000)
    expect(clockView(s, 40_000)?.remaining).toEqual({
      white: 162_000,
      black: 162_000,
    })
    s = gameReducer(s, { type: 'undo', at: 50_000 })
    expect(clockView(s, 50_000)?.remaining).toEqual({
      white: 162_000,
      black: 180_000,
    })
    s = gameReducer(s, { type: 'undo', at: 60_000 })
    expect(clockView(s, 60_000)?.remaining).toEqual({
      white: 180_000,
      black: 180_000,
    })
    // A taken-back position is an earlier position, so the clock waits for
    // the replacement move rather than charging the rethink.
    expect(clockView(s, 999_000)?.running).toBe(null)
  })

  it('freezes while an earlier position is reviewed', () => {
    let s = playAt(timed(0), 'c3', 'd4', 20_000)
    s = playAt(s, 'f6', 'e5', 40_000)
    s = gameReducer(s, { type: 'jumpTo', index: 1, at: 50_000 })
    expect(clockView(s, 50_000)?.running).toBe(null)
    expect(clockView(s, 999_000)?.remaining).toEqual({
      white: 162_000,
      black: 180_000,
    })
    s = gameReducer(s, { type: 'jumpTo', index: 2, at: 100_000 })
    expect(clockView(s, 100_000)?.running).toBe('white')
  })

  it('resumes a game that ended on time when the move is taken back', () => {
    let s = playAt(timed(0), 'c3', 'd4', 20_000)
    s = gameReducer(s, { type: 'flag', color: 'black', at: 300_000 })
    expect(outcome(s)).toBe('whiteWins')
    s = gameReducer(s, { type: 'undo', at: 310_000 })
    expect(outcome(s)).toBe('ongoing')
    expect(clockView(s, 310_000)?.remaining).toEqual({
      white: 180_000,
      black: 180_000,
    })
  })

  it('drops the clocks of a line a new move replaces', () => {
    let s = playAt(timed(0), 'c3', 'd4', 20_000)
    s = playAt(s, 'f6', 'e5', 40_000)
    s = gameReducer(s, { type: 'undo', at: 50_000 })
    s = playAt(s, 'f6', 'g5', 60_000)
    expect(s.moves).toHaveLength(2)
    expect(s.clock?.times).toHaveLength(3)
    // The replacement move was made off a frozen clock, so Black paid only
    // the increment for it; the old ply 2 is gone either way.
    expect(s.clock?.times[2]).toEqual({ white: 162_000, black: 182_000 })
    expect(s.clock?.startedAt).toBe(60_000)
  })

  it('starts a fresh clock for a new game and drops it for an untimed one', () => {
    let s = playAt(timed(0), 'c3', 'd4', 20_000)
    s = gameReducer(s, {
      type: 'newGame',
      setup: { opponentId: 'friend', humanColor: 'both', timeControlId: '1+0' },
      at: 30_000,
    })
    expect(clockView(s, 30_000)?.remaining).toEqual({
      white: 60_000,
      black: 60_000,
    })
    s = gameReducer(s, {
      type: 'newGame',
      setup: { opponentId: 'friend', humanColor: 'both' },
      at: 40_000,
    })
    expect(s.clock).toBe(null)
  })
})

describe('gameReducer: the clock along the timeline', () => {
  it('shows an earlier position as the live one it was, clock frozen', () => {
    let s = playAt(timed(0), 'c3', 'd4', 1_000)
    s = gameReducer(s, { type: 'flag', color: 'black', at: 300_000 })
    expect(outcome(s)).toBe('whiteWins')
    s = gameReducer(s, { type: 'jumpTo', index: 0, at: 310_000 })
    expect(outcome(s)).toBe('ongoing')
    expect(clockView(s, 999_000)?.running).toBe(null)
    expect(clockView(s, 999_000)?.remaining).toEqual({
      white: 180_000,
      black: 180_000,
    })
  })

  it('brings the loss on time back when the end is shown again', () => {
    let s = playAt(timed(0), 'c3', 'd4', 1_000)
    s = gameReducer(s, { type: 'flag', color: 'black', at: 300_000 })
    s = gameReducer(s, { type: 'jumpTo', index: 0, at: 310_000 })
    s = gameReducer(s, { type: 'jumpTo', index: 1, at: 320_000 })
    expect(outcome(s)).toBe('whiteWins')
    expect(clockView(s, 999_000)?.running).toBe(null)
    expect(clockView(s, 999_000)?.remaining.black).toBe(0)
  })

  it('keeps the loss on time through undo and redo', () => {
    let s = playAt(timed(0), 'c3', 'd4', 1_000)
    s = gameReducer(s, { type: 'flag', color: 'black', at: 300_000 })
    s = gameReducer(s, { type: 'undo', at: 310_000 })
    expect(outcome(s)).toBe('ongoing')
    s = gameReducer(s, { type: 'redo', at: 320_000 })
    expect(outcome(s)).toBe('whiteWins')
    expect(s.moves).toHaveLength(1)
    expect(clockView(s, 999_000)?.running).toBe(null)
  })

  it('lets the game go on once the lost move is replaced', () => {
    let s = playAt(timed(0), 'c3', 'd4', 1_000)
    s = gameReducer(s, { type: 'flag', color: 'black', at: 300_000 })
    s = gameReducer(s, { type: 'undo', at: 310_000 })
    s = playAt(s, 'c3', 'b4', 320_000)
    expect(outcome(s)).toBe('ongoing')
    expect(canRedoGame(s)).toBe(false)
    expect(s.clock?.flagged).toBe(null)
    expect(clockView(s, 320_000)?.running).toBe('black')
  })

  it('gives nothing back for a click on the position already shown', () => {
    const s = playAt(timed(0), 'c3', 'd4', 1_000)
    const before = clockView(s, 31_000)?.remaining
    const clicked = gameReducer(s, { type: 'jumpTo', index: 1, at: 31_000 })
    expect(clicked.history).toBe(s.history)
    expect(clockView(clicked, 31_000)?.remaining).toEqual(before)
  })

  it('starts a game that is already over with a stopped clock', () => {
    const s = initialState(
      {
        opponentId: 'friend',
        humanColor: 'both',
        timeControlId: '3+2',
      },
      fromBitPosition(parsePos('W:Wa1:Bb2,c3')),
      1_000,
    )
    expect(statusOf(s)).toBe('blackWins')
    expect(clockView(s, 999_000)?.running).toBe(null)
    expect(clockView(s, 999_000)?.remaining).toEqual({
      white: 180_000,
      black: 180_000,
    })
  })
})

describe('gameReducer: a decided game and the clock', () => {
  /** Two humans, 3 + 2, one quiet king ply away from the 30-ply draw. */
  function nearlyDrawn(): GameState {
    return {
      ...initialState(
        { opponentId: 'friend', humanColor: 'both', timeControlId: '3+2' },
        undefined,
        0,
      ),
      history: createHistory(fromBitPosition(parsePos('W:WKc1,h2:BKf8,a7:29'))),
    }
  }

  it('stops the clock once the board has decided the game', () => {
    const s = gameReducer(nearlyDrawn(), {
      type: 'tap',
      square: sq('c1'),
      at: 1_000,
    })
    const drawn = gameReducer(s, { type: 'tap', square: sq('d2'), at: 1_000 })
    expect(statusOf(drawn)).toBe('draw')
    expect(clockView(drawn, 999_000)?.running).toBe(null)
    expect(clockView(drawn, 999_000)?.remaining).toEqual({
      white: 181_000,
      black: 180_000,
    })
  })

  it('never turns a drawn game into a loss on time', () => {
    const s = gameReducer(nearlyDrawn(), {
      type: 'tap',
      square: sq('c1'),
      at: 1_000,
    })
    const drawn = gameReducer(s, { type: 'tap', square: sq('d2'), at: 1_000 })
    const later = gameReducer(drawn, {
      type: 'flag',
      color: 'black',
      at: 999_000,
    })
    expect(outcome(later)).toBe('draw')
  })
})

describe('gameReducer: offers', () => {
  /** The persona plays Black and has just moved; `score` is its reading. */
  function judged(literal: string, score: number): GameState {
    return {
      ...initialState({ opponentId: 'hare', humanColor: 'white' }),
      history: createHistory(fromBitPosition(parsePos(literal))),
      verdict: { ply: 0, score },
    }
  }

  /** Two kings walking up and down with nothing to show for it. */
  const shuffling = 'W:WKa1:BKh8:14'

  it('offers a draw once the kings have walked and neither side is ahead', () => {
    expect(currentOffer(judged(shuffling, 0))).toBe('draw')
  })

  it('keeps quiet while the shuffle is young or it is still ahead', () => {
    expect(currentOffer(judged('W:WKa1:BKh8:4', 0))).toBe(null)
    expect(currentOffer(judged(shuffling, 300))).toBe(null)
  })

  it('offers the way out of a game it has already won', () => {
    expect(currentOffer(judged('W:WKa1:BKh8', MATE_BOUND))).toBe('resign')
  })

  it('offers it for an ending the tables have decided too', () => {
    // A database win scores below every mate and above every evaluation.
    expect(currentOffer(judged('W:WKa1:BKh8', DB_WIN))).toBe('resign')
    expect(currentOffer(judged('W:WKa1:BKh8', DB_WIN_MIN))).toBe('resign')
  })

  it('still reads a position the tables call drawn as level', () => {
    // Such a position keeps a squeezed evaluation instead of a plain zero.
    expect(currentOffer(judged(shuffling, DB_DRAW_BAND))).toBe('draw')
    expect(currentOffer(judged(shuffling, -DB_DRAW_BAND))).toBe('draw')
  })

  it('says nothing about a position the verdict is not about', () => {
    const offered = judged(shuffling, 0)
    expect(currentOffer({ ...offered, verdict: null })).toBe(null)
    expect(currentOffer({ ...offered, verdict: { ply: 7, score: 0 } })).toBe(
      null,
    )
  })

  it('has no voice in a game between two humans', () => {
    const friends = {
      ...judged(shuffling, 0),
      setup: { opponentId: 'friend', humanColor: 'both' },
    } satisfies GameState
    expect(currentOffer(friends)).toBe(null)
  })

  it('draws the game when the human agrees', () => {
    const offered = judged(shuffling, 0)
    const after = gameReducer(offered, { type: 'accept', offer: 'draw' })
    expect(outcome(after)).toBe('draw')
    expect(finalOutcome(after)).toBe('draw')
    expect(finalAgreed(after)?.status).toBe('draw')
    // The game is over; the offer goes with it.
    expect(currentOffer(after)).toBe(null)
    expect(movable(after)).toEqual([])
  })

  it('hands the game to the other colour when the human gives it up', () => {
    const offered = judged('W:WKa1:BKh8', MATE_BOUND)
    const after = gameReducer(offered, { type: 'accept', offer: 'resign' })
    expect(outcome(after)).toBe('blackWins')
    expect(finalAgreed(after)?.status).toBe('blackWins')
  })

  it('ignores an answer to an offer that was never made', () => {
    const offered = judged(shuffling, 0)
    expect(gameReducer(offered, { type: 'accept', offer: 'resign' })).toBe(
      offered,
    )
  })

  it('ignores a refusal of an offer that was never made', () => {
    const quiet = { ...judged(shuffling, 0), verdict: null }
    expect(gameReducer(quiet, { type: 'decline', offer: 'draw' })).toBe(quiet)
  })

  it('does not ask again once the offer has been turned down', () => {
    const offered = judged(shuffling, 0)
    const declined = gameReducer(offered, { type: 'decline', offer: 'draw' })
    expect(currentOffer(declined)).toBe(null)
    // The other offer is a separate question and may still be put.
    expect(
      currentOffer({
        ...declined,
        verdict: { ply: 0, score: MATE_BOUND },
      }),
    ).toBe('resign')
    expect(gameReducer(declined, { type: 'decline', offer: 'draw' })).toBe(
      declined,
    )
  })

  it('takes the verdict from the reply and drops it on the human move', () => {
    const thinking = gameReducer(
      play(initialState({ opponentId: 'hare', humanColor: 'white' }), [
        'c3',
        'd4',
      ]),
      { type: 'think', id: 1 },
    )
    const move = legalMoves(currentPosition(thinking))[0]!
    const answered = gameReducer(thinking, {
      type: 'computerMove',
      id: 1,
      move,
      score: MATE_BOUND,
    })
    expect(answered.verdict).toEqual({ ply: 2, score: MATE_BOUND })
    expect(currentOffer(answered)).toBe('resign')

    const played = play(answered, ['a3', 'b4'])
    expect(played.verdict).toBe(null)
    expect(currentOffer(played)).toBe(null)
  })

  it('makes the game live again where it was taken back past the agreement', () => {
    const thinking = gameReducer(
      play(initialState({ opponentId: 'hare', humanColor: 'white' }), [
        'c3',
        'd4',
      ]),
      { type: 'think', id: 1 },
    )
    const answered = gameReducer(thinking, {
      type: 'computerMove',
      id: 1,
      move: legalMoves(currentPosition(thinking))[0]!,
      score: MATE_BOUND,
    })
    const resigned = gameReducer(answered, { type: 'accept', offer: 'resign' })
    expect(outcome(resigned)).toBe('blackWins')

    const back = gameReducer(resigned, { type: 'undo' })
    expect(outcome(back)).toBe('ongoing')
    // ...and playing on from there leaves nothing of it behind.
    expect(play(back, ['c3', 'b4']).agreed).toBe(null)
  })
})

describe('gameReducer: offers on a clock', () => {
  /** The persona plays Black; White is on move with an offer on the table. */
  function offered(literal: string, score: number, now = 0): GameState {
    return {
      ...initialState(
        { opponentId: 'hare', humanColor: 'white', timeControlId: '3+2' },
        undefined,
        now,
      ),
      history: createHistory(fromBitPosition(parsePos(literal))),
      verdict: { ply: 0, score },
    }
  }

  const shuffling = 'W:WKa1:BKh8:14'
  /** Three minutes each, and the offer went up the moment the clock did. */
  const BANK_MS = 180_000

  it('charges the time the player spent making up their mind', () => {
    const s = offered(shuffling, 0)
    expect(clockView(s, 4_000)?.remaining.white).toBe(BANK_MS - 4_000)

    const drawn = gameReducer(s, { type: 'accept', offer: 'draw', at: 4_000 })

    expect(outcome(drawn)).toBe('draw')
    expect(clockView(drawn, 9_000)?.running).toBe(null)
    // The reading stands where it was when they pressed, whenever it is read.
    expect(clockView(drawn, 9_000)?.remaining).toEqual({
      white: BANK_MS - 4_000,
      black: BANK_MS,
    })
  })

  it('loses the game where the bank emptied before the answer landed', () => {
    const s = offered(shuffling, 0)
    // The tick that would have called the flag has not run yet.
    const late = gameReducer(s, {
      type: 'accept',
      offer: 'draw',
      at: BANK_MS + 40,
    })
    expect(outcome(late)).toBe('blackWins')
    expect(late.agreed).toBe(null)
  })

  it('keeps the clock stopped on a ply that was agreed on', () => {
    // A game agreed at ply 1, then stepped back through and returned to.
    const played = playAt(offered(shuffling, 0), 'a1', 'b2', 1_000)
    const s = { ...played, verdict: { ply: 1, score: 0 } }
    const drawn = gameReducer(s, { type: 'accept', offer: 'draw', at: 2_000 })
    expect(outcome(drawn)).toBe('draw')

    const back = gameReducer(drawn, { type: 'jumpTo', index: 0, at: 3_000 })
    expect(outcome(back)).toBe('ongoing')
    const again = gameReducer(back, { type: 'jumpTo', index: 1, at: 4_000 })

    expect(outcome(again)).toBe('draw')
    expect(clockView(again, 500_000)?.running).toBe(null)
    expect(again.clock?.startedAt).toBe(null)
  })

  it('never turns a game agreed as drawn into a loss on time', () => {
    const s = offered(shuffling, 0)
    const drawn = gameReducer(s, { type: 'accept', offer: 'draw', at: 1_000 })
    const later = gameReducer(drawn, {
      type: 'flag',
      color: 'black',
      at: 999_000,
    })
    expect(outcome(later)).toBe('draw')
  })
})
