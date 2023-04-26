export type Color = 'white' | 'black'
export type Piece = 'o' | 'O' | 'x' | 'X'
export type Cell = Piece | ' '

export type Board = {
  turn: Color
  cells: Cell[]
  onlyKingMoves: number
}

export function createBoard(): Board {
  return {
    turn: 'white',
    cells: Array(32).fill(' '),
    onlyKingMoves: 0,
  }
}

export function createBoardWithStartingPositions(): Board {
  let state = createBoard()
  for (let i = 0; i < 12; i++) state.cells[i] = 'x'
  for (let i = 20; i < 32; i++) state.cells[i] = 'o'
  return state
}

export function isMen(p: Piece): boolean {
  switch (p) {
    case 'x':
    case 'o':
      return true
    case 'X':
    case 'O':
      return false
  }
}

export function isKing(p: Piece): boolean {
  return !isMen(p)
}

export function opponent(player: Color): Color {
  return player == 'black' ? 'white' : 'black'
}

export function piece(cell: Cell): Piece | undefined {
  if (cell == ' ') return undefined
  return cell
}

export function color(p: Piece): Color {
  switch (p) {
    case 'X':
    case 'x':
      return 'black'
    case 'o':
    case 'O':
      return 'white'
  }
}

export function copy(state: Board): Board {
  return {
    turn: state.turn,
    cells: state.cells.slice(),
    onlyKingMoves: state.onlyKingMoves,
  }
}

function isAllowed(x: number, y: number) {
  return (y % 2 == 0 && x % 2 == 1) || (y % 2 == 1 && x % 2 == 0)
}

export function coordinates(position: string): [number, number] {
  let x = position[0].charCodeAt(0) - 97
  let y = 8 - parseInt(position[1])
  if (!isAllowed(x, y)) {
    throw new Error(`Position ${position} not allowed in checkers.`)
  }
  return [x, y]
}

export function indexToCoordinates(i: number): [number, number] {
  let y = Math.floor(i / 4)
  let x = 2 * (i % 4) + (y % 2 == 0 ? 1 : 0)
  return [x, y]
}

export function indexToPosition(i: number): string {
  let [x, y] = indexToCoordinates(i)
  return String.fromCharCode(x + 97) + (8 - y)
}

export function index(x: number, y: number) {
  return Math.floor((x + y * 8) / 2)
}

export function at(position: string): number {
  let [x, y] = coordinates(position)
  return index(x, y)
}

export function apply(state: Board, move: string) {
  state.turn = opponent(state.turn)
  if (move.includes('-')) {
    let [from, to] = move.split('-')
    let a = at(from)
    let b = at(to)

    let p = piece(state.cells[a])
    if (p) {
      if (isKing(p)) {
        state.onlyKingMoves++
      }
      if (isMen(p)) {
        state.onlyKingMoves = 0
      }
    }

    state.cells[b] = state.cells[a]
    state.cells[a] = ' '

    // Become king?
    if (state.cells[b] == 'o') {
      let [, y] = coordinates(to)
      if (y == 0) {
        state.cells[b] = 'O'
      }
    }
    if (state.cells[b] == 'x') {
      let [, y] = coordinates(to)
      if (y == 7) {
        state.cells[b] = 'X'
      }
    }
  } else if (move.includes(':')) { // Взятие
    state.onlyKingMoves = 0

    let jumps = move.split(':')
    for (let i = 0; i + 1 < jumps.length; i++) {
      let from = jumps[i]
      let to = jumps[i + 1]

      let [x0, y0] = coordinates(from)
      let [x1, y1] = coordinates(to)

      let dx = Math.sign(x1 - x0)
      let dy = Math.sign(y1 - y0)
      for (let xx = x0 + dx, yy = y0 + dy; xx != x1 && yy != y1; xx += dx, yy += dy) {
        let eat = index(xx, yy)
        state.cells[eat] = ' '
      }

      let a = index(x0, y0)
      let b = index(x1, y1)
      state.cells[b] = state.cells[a]
      state.cells[a] = ' '

      if (state.cells[b] == 'o' && y1 == 0) {
        state.cells[b] = 'O'
      }
      if (state.cells[b] == 'x' && y1 == 7) {
        state.cells[b] = 'X'
      }
    }
  }
}
