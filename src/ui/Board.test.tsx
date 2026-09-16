import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { initialPosition, squareFromName } from '../game/board.ts'
import type { Move, Piece, Position } from '../game/types.ts'
import { Board } from './Board.tsx'
import { captureAnimations } from './testAnimations.ts'

describe('Board', () => {
  it('renders 64 squares as buttons', () => {
    render(<Board position={initialPosition()} orientation="white" />)
    expect(screen.getAllByRole('button')).toHaveLength(64)
  })

  it('renders 12 white and 12 black men in the starting position', () => {
    render(<Board position={initialPosition()} orientation="white" />)
    expect(screen.getAllByRole('button', { name: /белая шашка/ })).toHaveLength(
      12,
    )
    expect(
      screen.getAllByRole('button', { name: /чёрная шашка/ }),
    ).toHaveLength(12)
  })

  it('marks a1 dark and b1 light', () => {
    render(<Board position={initialPosition()} orientation="white" />)
    expect(screen.getByRole('button', { name: /^a1,/ })).toHaveClass(
      'board__square--dark',
    )
    expect(screen.getByRole('button', { name: /^b1,/ })).toHaveClass(
      'board__square--light',
    )
  })

  it('labels empty squares as empty', () => {
    render(<Board position={initialPosition()} orientation="white" />)
    expect(
      screen.getByRole('button', { name: 'd4, пустое поле' }),
    ).toBeInTheDocument()
  })

  it('shows a8 first when white is at the bottom', () => {
    render(<Board position={initialPosition()} orientation="white" />)
    const first = screen.getAllByRole('button')[0]
    expect(first).toHaveAccessibleName(/^a8,/)
  })

  it('shows h1 first when black is at the bottom', () => {
    render(<Board position={initialPosition()} orientation="black" />)
    const first = screen.getAllByRole('button')[0]
    expect(first).toHaveAccessibleName(/^h1,/)
  })

  it('shows file and rank coordinates', () => {
    render(<Board position={initialPosition()} orientation="white" />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })
})

describe('Board: last move', () => {
  it('marks origin and destination of the last move without sliding', () => {
    const lastMove = {
      from: squareFromName('c3'),
      to: squareFromName('d4'),
      captures: [],
      promotes: false,
      path: [squareFromName('d4')],
    }
    render(
      <Board
        position={initialPosition()}
        orientation="white"
        lastMove={lastMove}
        slide={null}
      />,
    )
    expect(screen.getByRole('button', { name: /^c3,/ })).toHaveClass(
      'board__square--last-from',
    )
    expect(screen.getByRole('button', { name: /^d4,/ })).toHaveClass(
      'board__square--last-to',
    )
    expect(document.querySelector('.board__piece--arrived')).toBeNull()
  })
})

describe('Board: keyboard entry point', () => {
  const tabbable = () =>
    screen
      .getAllByRole('button', { name: /^[a-h][1-8],/ })
      .find((b) => b.getAttribute('tabindex') === '0')

  it('starts at the bottom-left square for either orientation', () => {
    const { rerender } = render(
      <Board position={initialPosition()} orientation="white" />,
    )
    expect(tabbable()).toHaveAccessibleName(/^a1,/)

    rerender(<Board position={initialPosition()} orientation="black" />)
    expect(tabbable()).toHaveAccessibleName(/^h8,/)
  })
})

describe('Board: slide', () => {
  const animations = captureAnimations()
  const pieceOn = (name: string) =>
    screen
      .getByRole('button', { name: new RegExp(`^${name},`) })
      .querySelector('.board__piece')

  // c3 takes on d4 to e5, then on d6 to c7: origin and destination share a
  // file, so a straight slide would not move the piece sideways at all.
  const chain: Move = {
    from: squareFromName('c3'),
    to: squareFromName('c7'),
    captures: [squareFromName('d4'), squareFromName('d6')],
    promotes: false,
    path: [squareFromName('e5'), squareFromName('c7')],
  }

  /** The position the chain leaves behind: the mover alone on c7. */
  function afterChain(): Position {
    const board = new Array<Piece | undefined>(64).fill(undefined)
    board[squareFromName('c7')] = { color: 'white', kind: 'man' }
    return { board, toMove: 'black', drawCounter: 0 }
  }

  it('flies the arriving piece through every landing square', () => {
    render(
      <Board
        position={afterChain()}
        orientation="white"
        lastMove={chain}
        slide={chain}
      />,
    )
    const piece = pieceOn('c7')
    expect(piece).toHaveClass('board__piece--arrived')
    expect(animations.of(piece)).toEqual([
      'translate(0%, 400%)', // c3
      'translate(200%, 200%)', // e5
      'translate(0%, 0%)', // c7
    ])
  })

  it('mirrors the path when the board is flipped', () => {
    render(
      <Board
        position={afterChain()}
        orientation="black"
        lastMove={chain}
        slide={chain}
      />,
    )
    expect(animations.of(pieceOn('c7'))).toEqual([
      'translate(0%, -400%)',
      'translate(-200%, -200%)',
      'translate(0%, 0%)',
    ])
  })

  it('flies a half-entered capture over the jumps it has just taken', () => {
    // The capture is not over: the piece stands on e5 with d4 still on the
    // board, and only the leg it has covered so far is flown.
    const board = new Array<Piece | undefined>(64).fill(undefined)
    board[squareFromName('e5')] = { color: 'white', kind: 'man' }
    board[squareFromName('d4')] = { color: 'black', kind: 'man' }
    render(
      <Board
        position={{ board, toMove: 'white', drawCounter: 0 }}
        orientation="white"
        slide={{
          from: squareFromName('c3'),
          path: [squareFromName('e5')],
        }}
      />,
    )
    const piece = pieceOn('e5')
    expect(piece).toHaveClass('board__piece--arrived')
    expect(animations.of(piece)).toEqual([
      'translate(-200%, 200%)', // c3
      'translate(0%, 0%)', // e5
    ])
  })

  it('animates nothing when no slide is asked for', () => {
    render(
      <Board position={afterChain()} orientation="white" lastMove={chain} />,
    )
    expect(pieceOn('c7')).not.toHaveClass('board__piece--arrived')
    expect(animations.all()).toHaveLength(0)
  })
})
