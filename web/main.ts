import { spawn, Pool } from 'threads'
import {
  apply,
  Board,
  Color,
  color,
  copy, createBoard,
  createBoardWithStartingPositions,
  isKing,
  piece
} from './board'
import './style.css'
import { $, domReady, sleep } from './utils'
import { worker } from './worker'
// @ts-ignore
import Worker from './worker?worker'

domReady(main)

async function main() {
  const pool = Pool(() => spawn<worker>(new Worker('worker.js')))

  while(true) {
    let done = await pool.queue(worker => worker.buildTime()).then(v => {
      if (!v) {
        return false
      }
      let version = document.createElement('div')
      version.style.fontFamily = 'monospace'
      version.style.fontSize = '8px'
      version.style.position = 'fixed'
      version.style.left = '5px'
      version.style.bottom = '5px'
      version.style.zIndex = '-1'
      version.textContent = `[${v}]`
      document.body.appendChild(version)
      return true
    })
    if (done) {
      break
    }
    console.log('waiting for wasm...')
    await sleep(200)
  }

  let letters = $('#board .letters')!
  let lines = $('#board .lines')!
  let board = $('#board .playground')!
  let historyNode = $('#history')!
  let newGameButton = $('#new-game')!
  let backButton = $('#back')!
  let forwardButton = $('#forward')!
  let opponent = $('#opponent')!
  let statusBar = $('#status')!

  // (.)(.)
  let currentState = createBoard()
  let depth = 6
  let popIndex = 0
  const popSize = 10

  let history: [string | undefined, Board][] = []
  let historyPointer = 1

  function resize() {
    let {height} = board.getBoundingClientRect()
    board.style.width = height + 'px'
  }

  window.addEventListener('load', resize)
  window.addEventListener('resize', resize)

  for (let i = 0; i < 8; i++) {
    let lineNumber = document.createElement('div')
    lineNumber.textContent = (8 - i).toString()
    lines.appendChild(lineNumber)
    let letter = document.createElement('div')
    letter.textContent = String.fromCharCode(97 + i)
    letters.appendChild(letter)
  }
  for (let i = 0; i < 64; i++) {
    let x = i % 8
    let y = 8 - Math.floor(i / 8)
    let pos = `${'abcdefgh'[x]}${y}`
    let cell = document.createElement('div')
    cell.dataset.number = pos
    cell.className = x % 2 == y % 2 ? 'light' : 'dark'
    board.appendChild(cell)
  }

  function newGame() {
    currentState = createBoardWithStartingPositions()
    // currentState = createBoard()
    // currentState.cells[1] = 'O'
    // currentState.cells[31] = 'o'
    // currentState.cells[9] = 'X'
    // currentState.cells[21] = 'X'
    // currentState.cells[22] = 'X'
    history = [[undefined, currentState]]
    historyPointer = 1
    render(currentState)
    historyNode.innerHTML = ''
    popIndex = Math.floor(Math.random() * popSize)
    pool.queue(w => w.popName(popIndex)).then(name => opponent.textContent = name)
  }

  newGame()
  render(currentState)
  resize()

  newGameButton.addEventListener('click', () => newGame())

  let jumpMoves: string[] = []
  dragAndDrop(board, async (from, to) => {
    if (from == to) {
      return false
    }
    let allPossibleMoves = await allMoves(currentState)
    // Normal move
    {
      let move = `${from}-${to}`
      if (allPossibleMoves.includes(move)) {
        step(currentState, move)
        jumpMoves = []
        return true
      }
    }
    if (jumpMoves.length == 0) {
      jumpMoves = [from]
    }
    jumpMoves.push(to)
    let move = jumpMoves.join(':')
    if (allPossibleMoves.includes(move)) {
      jumpMoves = []
      step(currentState, move)
      return true
    }
    let currentPossibleMoves = allPossibleMoves.filter(m => m.startsWith(move))
    if (currentPossibleMoves.length == 0) {
      jumpMoves = []
      return false
    }
    return true
  })

  async function allMoves(b: Board): Promise<string[]> {
    return pool.queue(w => w.allMoves(b))
  }

  async function bestMove(b: Board): Promise<string> {
    let moves = await allMoves(b)

    if (moves.length == 0) {
      throw new Error(`No moves available. Player ${b.turn} lost.`)
    }
    if (b.onlyKingMoves > 15) {
      throw new Error(`Draw. More than 15 only king moves.`)
    }
    if (moves.length == 1) {
      return moves[0]
    }

    let bestMove = moves[0]
    let bestRate = b.turn == 'white' ? -Infinity : Infinity
    let bestSteps = Infinity

    for (let move of moves) {
      let state = copy(b)
      apply(state, move)
      pool.queue(async w => {
        let [rate, steps] = await w.minimax(state, depth, popIndex)
        console.log(`=> ${move} (${rate.toFixed(10)}, ${steps})`)
        if (b.turn == 'white') {
          if (rate > bestRate) {
            bestRate = rate
            bestMove = move
            bestSteps = steps
          } else if (rate == bestRate && steps < bestSteps) {
            bestMove = move
            bestSteps = steps
          }
        } else {
          if (rate < bestRate) {
            bestRate = rate
            bestMove = move
            bestSteps = steps
          } else if (rate == bestRate && steps < bestSteps) {
            bestMove = move
            bestSteps = steps
          }
        }
      })
    }
    await pool.completed()
    console.log(`best move ${bestMove} (${bestRate.toFixed(4)}, ${bestSteps})`)
    console.log('----------------')
    return bestMove
  }

  function step(prev: Board, userMove: string) {
    setTimeout(async () => {
      let state = copy(prev)
      let moves = await allMoves(prev)

      if (moves.includes(userMove)) {
        apply(state, userMove)
        currentState = state
        render(state)
        recordHistory('white', userMove, state)

        let newState = copy(currentState)
        statusBar.textContent = 'Думаю...'
        let move = await bestMove(newState)
        statusBar.textContent = ''
        if (move) {
          animateMove(move, () => {
            if (move) {
              apply(newState, move)
              currentState = newState
              render(newState)
              recordHistory('black', move, newState)
              highlightMove(move)
            }
          })
        }

      }
    }, 0)
  }

  function render(state: Board) {
    removeHighlight()
    for (let i = 0; i < board.children.length; i++) {
      board.children[i].innerHTML = ''
    }
    for (let i = 0; i < state.cells.length; i++) {
      let p = piece(state.cells[i])
      if (p) {
        let piece = document.createElement('div')
        piece.className = 'piece ' + color(p)
        if (isKing(p)) {
          piece.classList.add('queen')
        }
        let k = boardIndex(i)
        board.children[k].appendChild(piece)
      }
    }
  }

  function boardIndex(i: number) {
    if (Math.floor(i / 4) % 2 == 0)
      return 1 + i * 2
    else
      return i * 2
  }

  function addMove(player: Color, move: string | undefined, i: number) {
    if (player == 'white') {
      let line = document.createElement('div')
      line.textContent = `${Math.ceil(i)}. `
      historyNode.appendChild(line)
      let moveNode = document.createElement('span')
      moveNode.dataset.move = i.toString()
      moveNode.textContent = move || '?'
      line.appendChild(moveNode)
    } else {
      let moveNode = document.createElement('span')
      moveNode.dataset.move = i.toString()
      moveNode.textContent = ' ' + (move || '?')
      historyNode.lastChild!.appendChild(moveNode)
    }
  }

  function recordHistory(player: Color, move: string | undefined, state: Board) {
    historyPointer++
    if (historyPointer < history.length) {
      history[historyPointer] = [move, state]
      history.splice(historyPointer + 1)
      historyNode.innerHTML = ''
      for (let [move] of history.slice(1)) {
        addMove(player, move, historyPointer / 2)
      }
    } else {
      history.push([move, state])
      addMove(player, move, historyPointer / 2)
    }
  }

  function highlightCurrentMoveInHistory() {
    let oldNode = $('.history-pointer')
    if (oldNode) {
      oldNode.classList.remove('history-pointer')
    }
    let i = historyPointer - 1
    let move = historyNode.querySelector(`[data-move="${i}"]`)
    if (move) {
      move.classList.add('history-pointer')
    }
  }

  function removeHighlight() {
    let h = board.querySelectorAll('.highlight')
    for (let i = 0; i < h.length; i++) {
      h[i].classList.remove('highlight')
    }
  }

  function highlightMove(move: string) {
    removeHighlight()
    let cells = move.split(/[\-:]/)
    for (let cell of cells) {
      let node = board.querySelector(`[data-number="${cell}"]`)
      if (node) {
        node.classList.add('highlight')
      }
    }
  }

  function setStateFromHistory() {
    highlightCurrentMoveInHistory()
    let [move, state] = history[historyPointer]
    currentState = state
    render(state)
    if (move) {
      highlightMove(move)
    }
  }

  backButton.addEventListener('click', () => {
    if (historyPointer > 0) {
      historyPointer--
      setStateFromHistory()
    }
  })

  forwardButton.addEventListener('click', () => {
    if (historyPointer + 1 < history.length) {
      historyPointer++
      setStateFromHistory()
    }
  })

  function animateMove(move: string, cb: () => void) {
    let cells = move.split(/[\-:]/)
    if (cells.length == 0) {
      return
    }
    let piece = board.querySelector(`[data-number="${cells.shift()}"] .piece`) as HTMLElement
    if (!piece) {
      return
    }

    let rect = piece.getBoundingClientRect()
    piece.style.position = 'absolute'
    piece.style.zIndex = '1000'
    piece.style.top = rect.top + 'px'
    piece.style.left = rect.left + 'px'
    piece.style.width = rect.width + 'px'
    piece.style.height = rect.height + 'px'
    piece.classList.add('animating')
    document.body.appendChild(piece)

    function reset() {
      piece.parentElement!.removeChild(piece)
    }

    let goTo = () => {
      let cell = board.querySelector(`[data-number="${cells.shift()}"]`) as HTMLElement
      if (cell) {
        let cr = cell.getBoundingClientRect()
        piece.style.top = (cr.top + cr.height / 2 - rect.height / 2) + 'px'
        piece.style.left = (cr.left + cr.width / 2 - rect.height / 2) + 'px'
      }
      if (cells.length > 0) {
        setTimeout(goTo, 200)
      } else {
        setTimeout(() => {
          reset()
          cb()
        }, 200)
      }
    }
    goTo()
  }
}

function dragAndDrop(board: HTMLElement, onDrop: (from: string, to: string) => Promise<boolean>) {
  board.addEventListener('dragstart', () => false)
  board.addEventListener('mousedown', event => {
    let piece = event.target as HTMLElement
    if (!piece.classList.contains('piece')) {
      return
    }

    let parent = piece.parentElement!
    let from = parent.dataset.number!
    let rect = piece.getBoundingClientRect()
    let shiftX = event.clientX - rect.left
    let shiftY = event.clientY - rect.top

    function moveAt(pageX: number, pageY: number) {
      piece.style.left = pageX - shiftX + 'px'
      piece.style.top = pageY - shiftY + 'px'
    }

    piece.style.width = rect.width + 'px'
    piece.style.height = rect.height + 'px'
    piece.style.position = 'absolute'
    piece.style.zIndex = '1000'
    moveAt(event.pageX, event.pageY)
    document.body.appendChild(piece)

    function reset() {
      piece.style.position = ''
      piece.style.zIndex = ''
      piece.style.top = ''
      piece.style.left = ''
      piece.style.width = ''
      piece.style.height = ''
    }

    function onMouseMove(event: MouseEvent) {
      moveAt(event.pageX, event.pageY)
    }

    document.addEventListener('mousemove', onMouseMove)

    piece.onmouseup = async function () {
      let rect = piece.getBoundingClientRect()
      piece.hidden = true
      let below = document.elementFromPoint(rect.x + rect.height / 2, rect.y + rect.width / 2)
      piece.hidden = false

      if (!below) {
        return
      }

      let droppableBelow = below.closest('.playground > div') as HTMLElement
      if (droppableBelow) {
        let to = droppableBelow.dataset.number!
        let canDrop = await onDrop(from, to)
        if (canDrop) {
          droppableBelow.appendChild(piece)
        } else {
          parent.appendChild(piece)
        }
      } else {
        parent.appendChild(piece)
      }
      reset()
      document.removeEventListener('mousemove', onMouseMove)
      piece.onmouseup = null
    }
  })
}

