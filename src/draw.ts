import {Cell, Piece, Player} from './game'
import {
  countPieces,
  diagonalCorners,
  getDiagonals,
  isMainDiagonal,
  State
} from './state'

let QUEENS_MOVES_TO_DRAW = 15

export function set_QUEENS_MOVES_TO_DRAW(v: number) {
  QUEENS_MOVES_TO_DRAW = v
}

export function isDrawNaive(state: State, player: Player) {
  if (state.onlyQueensMovesCount > QUEENS_MOVES_TO_DRAW) {
    return true
  }
  return false
}

export function isDraw(state: State, player: Player) {
  if (state.onlyQueensMovesCount > QUEENS_MOVES_TO_DRAW) {
    return true
  }

  if (Object.values(state.positions).some(n => n >= 3)) {
    return true
  }

  function empty(diagPart: Cell[]): boolean {
    return diagPart.every(cell => cell == ' ')
  }

  let s = countPieces(state)
  let playerPos = player == 'white' ? s.whitePos : s.blackPos
  let opponent: Piece = player == 'white' ? 'X' : 'O'
  let myQueenCount = player == 'white' ? s.whiteQueenCount : s.blackQueenCount
  let opponentQueenCount = player == 'white' ? s.blackQueenCount : s.whiteQueenCount

  if (s.whiteCount == 0 && s.blackCount == 0) { // Остались только дамки

    if (myQueenCount == 1 && opponentQueenCount == 1) { // 1 vs 1
      let [a, b] = getDiagonals(state, playerPos)
      if (
        // Диагонали должны быть пустыми, то что в углах неважно.
        empty(a[0].slice(1)) && empty(a[1].slice(0, -1)) &&
        empty(b[0].slice(1)) && empty(b[1].slice(0, -1)) &&
        (
          // Если на главной диагонале, то нужно убедиться
          // что в угле нету противника:
          //    a b c d e f g h
          //  8   .   .   .   X 8
          //  7 .   .   .   .   7
          //  6   .   .   .   . 6
          //  5 .   .   .   .   5
          //  4   .   .   .   . 4
          //  3 .   .   .   .   3
          //  2   O   .   .   . 2
          //  1 .   .   .   .   1
          //    a b c d e f g h
          isMainDiagonal(b)
            ? !diagonalCorners(b).some(corner => corner == opponent)
            : true
        )
      ) {
        return true
      }
    }

    if (myQueenCount == 1 && opponentQueenCount == 2) {// 1 vs 2
      let [a, b] = getDiagonals(state, playerPos)
      if (
        a.every(empty) && b.every(empty)
      ) {
        return true
      }
    }

    if (myQueenCount == 1 && opponentQueenCount == 3) {// 1 vs 3
      let [a, b] = getDiagonals(state, playerPos)
      if (
        // На главной диагонале и она пустая
        isMainDiagonal(b) && b.every(empty)
        // А так же не нужно никого есть
        //    a b c d e f g h
        //  8   X   X   .   . 8
        //  7 .   .   .   .   7
        //  6   .   X   .   . 6
        //  5 .   .   O   .   5
        //  4   .   .   .   . 4
        //  3 .   .   .   .   3
        //  2   .   .   .   . 2
        //  1 .   .   .   .   1
        //    a b c d e f g h
        && empty(a[0].slice(1)) && empty(a[1].slice(0, -1))
      ) {
        return true
      }
    }
  }

  return false
}
