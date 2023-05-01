import {Cell, isMen, isQueen, Piece, onCell, ofPlayer, Player} from './game'

export type  State = {
  cells: Cell[]

  // Партия считается закончившейся вничью:

  // Если в течение 15 ходов игроки делали ходы только дамками,
  // не передвигая простых шашек и не производя взятия.
  onlyQueensMovesCount: number

  // Если три раза повторяется одна и та же позиция.
  positions: { [hash: string]: number }
}

export function createEmptyBoardState(): State {
  return {
    cells: Array(32).fill(' '),
    onlyQueensMovesCount: 0,
    positions: {},
  }
}

export function createStartGameState(): State {
  let state = createEmptyBoardState()
  for (let i = 0; i < 12; i++) state.cells[i] = 'x'
  for (let i = 20; i < 32; i++) state.cells[i] = 'o'
  return state
}

export function apply(state: State, move: string) {
  if (move.includes('-')) {
    let [from, to] = move.split('-')
    let a = indexFromString(from)
    let b = indexFromString(to)

    let p = onCell(state.cells[a])
    if (p) {
      if (isQueen(p)) {
        let h = hash(state, ofPlayer(p))
        state.positions[h] = (state.positions[h] || 0) + 1
      }
      if (isQueen(p) && ofPlayer(p) == 'black') {
        state.onlyQueensMovesCount++
      }
      if (isMen(p)) {
        state.onlyQueensMovesCount = 0
      }
    }

    state.cells[b] = state.cells[a]
    state.cells[a] = ' '

    // Become queen?
    if (state.cells[b] == 'o') {
      let [, y] = xy(to)
      if (y == 0) {
        state.cells[b] = 'O'
      }
    }
    if (state.cells[b] == 'x') {
      let [, y] = xy(to)
      if (y == 7) {
        state.cells[b] = 'X'
      }
    }
  }
  if (move.includes(':')) { // Взятие
    state.onlyQueensMovesCount = 0
    state.positions = {} // После взятия позиция точно не повторяется.

    let jumps = move.split(':')
    for (let i = 0; i + 1 < jumps.length; i++) {
      let from = jumps[i]
      let to = jumps[i + 1]

      let [x0, y0] = xy(from)
      let [x1, y1] = xy(to)

      let dx = Math.sign(x1 - x0)
      let dy = Math.sign(y1 - y0)
      for (let xx = x0 + dx, yy = y0 + dy; xx != x1 && yy != y1; xx += dx, yy += dy) {
        let eat = at(xx, yy)
        state.cells[eat] = ' '
      }

      let a = at(x0, y0)
      let b = at(x1, y1)
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

export function copy(state: State): State {
  return {
    cells: state.cells.slice(),
    onlyQueensMovesCount: state.onlyQueensMovesCount,
    positions: {...state.positions}
  }
}

export function generateAllPossibleMoves(state: State, player: Player): string[] {
  let allMoves: string[] = []
  for (let i = 0; i < state.cells.length; i++) {
    let piece = onCell(state.cells[i])
    if (piece && ofPlayer(piece) == player) {
      allMoves.push(...generateMoves(state, i))
    }
  }
  let eatMoves: string[] = []
  for (let i = 0; i < allMoves.length; i++) {
    if (allMoves[i].includes(':')) {
      eatMoves.push(allMoves[i])
    }
  }
  if (eatMoves.length > 0) {
    allMoves = eatMoves
  }
  return allMoves
}

export function generateMoves(state: State, fromCell: number): string[] {
  let moves: string[] = []
  let value = state.cells[fromCell]
  if (value == ' ') {
    return moves
  }

  let fromCellString = stringFromIndex(fromCell)
  let y = Math.floor(fromCell / 4)
  let x = 2 * (fromCell % 4) + (y % 2 == 0 ? 1 : 0)

  if (isMen(value)) { // Men
    // Takes
    let jumps = menJumps(state, value, fromCell, x, y, new Set())
    for (let i = 0; i < jumps.length; i++) {
      jumps[i] = fromCellString + ':' + jumps[i]
    }
    moves.push(...jumps)

    if (moves.length == 0) {
      // White normal moves
      if (value == 'o' && inBoard(y - 1)) { // Up one line
        for (let dx of [-1, 1]) {
          if (inBoard(x + dx)) { // Left, right
            let to = at(x + dx, y - 1)
            if (state.cells[to] == ' ') {
              moves.push(`${stringFromIndex(fromCell)}-${stringFromIndex(to)}`)
            }
          }
        }
      }

      // Black normal moves
      if (value == 'x' && inBoard(y + 1)) { // Up one line
        for (let dx of [-1, 1]) {
          if (inBoard(x + dx)) { // Left, right
            let to = at(x + dx, y + 1)
            if (state.cells[to] == ' ') {
              moves.push(`${stringFromIndex(fromCell)}-${stringFromIndex(to)}`)
            }
          }
        }
      }
    }
  }

  if (isQueen(value)) { // Queen
    // Takes
    let jumps = queenJumps(state, value, fromCell, x, y, new Set())
    for (let i = 0; i < jumps.length; i++) {
      jumps[i] = fromCellString + ':' + jumps[i]
    }
    moves.push(...jumps)

    if (moves.length == 0) {
      // Moves
      for (let dx of [-1, 1]) {
        for (let dy of [-1, 1]) {
          let x0 = x, y0 = y
          while (inBoard(x0 + dx, y0 + dy)) {
            x0 += dx
            y0 += dy
            let to = at(x0, y0)
            if (state.cells[to] == ' ') {
              moves.push(`${stringFromIndex(fromCell)}-${stringFromIndex(to)}`)
            } else {
              break
            }
          }
        }
      }
    }
  }


  return moves
}

export function menJumps(state: State, pieceValue: Piece, startingPosition: number, x0: number, y0: number, visited: Set<number>): string[] {
  let jumps = []
  for (let dx of [-1, 1]) {
    for (let dy of [-1, 1]) {
      if (inBoard(x0 + dx, y0 + dy, x0 + 2 * dx, y0 + 2 * dy)) {
        let eat = at(x0 + dx, y0 + dy)
        if (isEnemy(state, pieceValue, eat) && !visited.has(eat)) {
          let x1 = x0 + 2 * dx
          let y1 = y0 + 2 * dy
          let jmp = at(x1, y1)
          let pos = stringFromIndex(jmp)
          if (state.cells[jmp] == ' ' || jmp == startingPosition) {

            let newVisited = new Set(visited)
            newVisited.add(eat)
            let recJumps: string[]
            if (pieceValue == 'o' && y1 == 0) {
              recJumps = queenJumps(state, 'O', startingPosition, x1, y1, newVisited)
            } else if (pieceValue == 'x' && y1 == 7) {
              recJumps = queenJumps(state, 'X', startingPosition, x1, y1, newVisited)
            } else {
              recJumps = menJumps(state, pieceValue, startingPosition, x1, y1, newVisited)
            }
            if (recJumps.length == 0) {
              jumps.push(pos)
            } else {
              for (let s of recJumps) {
                jumps.push(pos + ':' + s)
              }
            }
          }
        }
      }
    }
  }
  return jumps
}

export function queenJumps(state: State, pieceValue: Piece, startingPosition: number, x0: number, y0: number, visited: Set<number>): string[] {
  let jumps: string[] = []
  for (let dx of [-1, 1]) {
    for (let dy of [-1, 1]) {
      let x = x0
      let y = y0
      let pos = at(x, y)

      while (inBoard(x + dx, y + dy)) {
        x += dx
        y += dy
        pos = at(x, y)
        if (state.cells[pos] != ' ') {
          break
        }
      }

      if (inBoard(x, y) && isEnemy(state, pieceValue, pos) && !visited.has(pos)) {
        x += dx
        y += dy
        let jmp = at(x, y)

        // Player can choose on which cell land, but forced to eat all possible pieces.
        let endPositions: string[] = []
        let foundMoreToEat = false

        while (inBoard(x, y) && (state.cells[jmp] == ' ' || jmp == startingPosition)) {
          let newVisited = new Set(visited)
          newVisited.add(pos)
          let recJumps = queenJumps(state, pieceValue, startingPosition, x, y, newVisited)
          if (recJumps.length == 0) {
            endPositions.push(stringFromIndex(jmp))
          } else {
            for (let s of recJumps) {
              jumps.push(stringFromIndex(jmp) + ':' + s)
              foundMoreToEat = true
            }
          }
          x += dx
          y += dy
          jmp = at(x, y)
        }

        if (!foundMoreToEat) {
          jumps.push(...endPositions)
        }
      }
    }
  }
  return jumps
}

export function isEnemy(state: State, cellValue: Cell, position: number): boolean {
  let p = onCell(state.cells[position])
  if (p === undefined) {
    return false
  }
  let c = onCell(cellValue)
  if (c === undefined) {
    return false
  }
  if (ofPlayer(c) == 'white') {
    return ofPlayer(p) == 'black'
  }
  return ofPlayer(p) == 'white'
}

export function stringify(state: State) {
  let out = '  a b c d e f g h\n8'
  for (let i = 0; i < 64; i++) {
    if (i % 8 == 0 && i != 0) {
      out += ' ' + (9 - i / 8) + '\n' + (8 - i / 8)
    }
    let [x, y] = [i % 8, Math.floor(i / 8)]
    if (isAllowed(x, y)) {
      let k = state.cells[Math.floor(i / 2)]
      if (k == 'o') {
        out += ' o'
      } else if (k == 'O') {
        out += ' O'
      } else if (k == 'x') {
        out += ' x'
      } else if (k == 'X') {
        out += ' X'
      } else if (k == ' ') {
        out += ' .'
      }
    } else {
      out += '  '
    }
  }
  out += ' 1\n  a b c d e f g h'
  return out
}

function inBoard(...xs: number[]): boolean {
  for (let x of xs) {
    if (0 <= x && x < 8) {
      continue
    }
    return false
  }
  return true
}

function xy(position: string): [number, number] {
  return [position[0].charCodeAt(0) - 97, 8 - parseInt(position[1])]
}

function at(x: number, y: number) {
  return Math.floor((x + y * 8) / 2)
}

export function indexFromString(s: string): number {
  let [x, y] = xy(s)
  if (!isAllowed(x, y)) {
    throw new Error(`Position ${s} not allowed in checkers.`)
  }
  return at(x, y)
}

function stringFromIndex(i: number): string {
  let y = 8 - Math.floor(i / 4)
  let x = 2 * (i % 4) + (y % 2 == 0 ? 1 : 0)
  return `${'abcdefgh'[x]}${y}`
}

function stringFromCoord(x: number, y: number): string {
  return `${'abcdefgh'[x]}${8 - y}`
}

function isAllowed(x: number, y: number) {
  return (y % 2 == 0 && x % 2 == 1) || (y % 2 == 1 && x % 2 == 0)
}

export type PiecesCount = {
  blackCount: number
  blackQueenCount: number
  blackPos: number
  whiteCount: number
  whiteQueenCount: number
  whitePos: number
}

export function countPieces(state: State): PiecesCount {
  let stat: PiecesCount = {
    blackQueenCount: 0,
    blackCount: 0,
    blackPos: 0,
    whitePos: 0,
    whiteQueenCount: 0,
    whiteCount: 0
  }
  for (let i = 0; i < 32; i++) {
    switch (state.cells[i]) {
      case 'o':
        stat.whiteCount++
        break
      case 'O':
        stat.whiteQueenCount++
        stat.whitePos = i
        break
      case 'x':
        stat.blackCount++
        break
      case 'X':
        stat.blackQueenCount++
        stat.blackPos = i
        break
      case ' ':
        break
    }
  }
  return stat
}

// A vs B diagonals:
//    .   .   .   B
//  A   .   .   B
//    A   .   B   .
//  .   A   B   .
//    .   A   .   .
//  .   B   A   .
//    B   .   A   .
//  B   .   .   A
export type DiagonalA = [Cell[], Cell[]] & { __kind: 'diagonal_a' }
export type DiagonalB = [Cell[], Cell[]] & { __kind: 'diagonal_b' }

export function getDiagonals(state: State, index: number): [DiagonalA, DiagonalB] {
  let [x, y] = xy(stringFromIndex(index))
  let a: DiagonalA = [[], []] as any
  for (let i = 1; x - i >= 0 && y - i >= 0; i++) {
    a[0].unshift(state.cells[at(x - i, y - i)])
  }
  for (let i = 1; x + i < 8 && y + i < 8; i++) {
    a[1].push(state.cells[at(x + i, y + i)])
  }
  let b: DiagonalB = [[], []] as any
  for (let i = 1; x - i >= 0 && y + i < 8; i++) {
    b[0].unshift(state.cells[at(x - i, y + i)])
  }
  for (let i = 1; x + i < 8 && y - i >= 0; i++) {
    b[1].push(state.cells[at(x + i, y - i)])
  }
  return [a, b]
}

export function diagonalCorners(d: DiagonalA | DiagonalB): Cell[] {
  let c: Cell[] = []
  if (d[0].length > 0) c.push(d[0][0])
  if (d[1].length > 0) c.push(d[1][d[1].length - 1])
  return c
}

export function diagonalSize(d: DiagonalA | DiagonalB): number {
  return d[0].length + d[1].length
}

export function isMainDiagonal(d: DiagonalB): boolean {
  return diagonalSize(d) == 7 // As the current piece removed, so NOT 8
}

export function hash(state: State, player: Player): string {
  return player + state.cells.join('')
}
