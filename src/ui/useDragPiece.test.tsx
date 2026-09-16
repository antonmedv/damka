import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { displayCell, initialPosition, squareFromName } from '../game/board.ts'
import { Board } from './Board.tsx'

const CELL = 100
const square = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name},`) })
/** Viewport centre of a square, given the mocked 800x800 grid at (0, 0). */
const pt = (name: string) => {
  const { row, col } = displayCell(squareFromName(name), 'white')
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 }
}
const lifted = () => document.querySelector('.board__lifted')

function renderBoard() {
  const onSquareTap = vi.fn()
  const onSelect = vi.fn()
  const onMove = vi.fn()
  render(
    <Board
      position={initialPosition()}
      orientation="white"
      selected={null}
      targets={[squareFromName('d4'), squareFromName('b4')]}
      onSquareTap={onSquareTap}
      onSelect={onSelect}
      onMove={onMove}
    />,
  )
  return { onSquareTap, onSelect, onMove, user: userEvent.setup() }
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 800,
    height: 800,
    right: 800,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('drag to move', () => {
  it('lifts the piece once the pointer moves past the threshold', async () => {
    const { user, onSelect } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('c3'), coords: { x: pt('c3').x + 2, y: pt('c3').y } },
    ])
    expect(lifted()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()

    await user.pointer({
      target: square('c3'),
      coords: { x: pt('c3').x + 20, y: pt('c3').y - 20 },
    })
    expect(lifted()).toHaveClass('board__lifted--dragging')
    expect(onSelect).toHaveBeenCalledWith(squareFromName('c3'))
    // The piece leaves its square while lifted.
    expect(square('c3').querySelector('.piece')).toBeNull()
  })

  it('highlights the target under the pointer and moves on release', async () => {
    const { user, onMove, onSquareTap } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('d4'), coords: pt('d4') },
    ])
    expect(square('d4')).toHaveClass('board__square--target-hover')
    expect(square('b4')).not.toHaveClass('board__square--target-hover')

    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('d4'),
      coords: pt('d4'),
    })
    expect(onMove).toHaveBeenCalledWith(
      squareFromName('c3'),
      squareFromName('d4'),
    )
    expect(onSquareTap).not.toHaveBeenCalled()
    expect(lifted()).toHaveClass('board__lifted--settling')
    await waitFor(() => expect(lifted()).toBeNull())
  })

  it('does not highlight a square that is not a target', async () => {
    const { user } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('e5'), coords: pt('e5') },
    ])
    expect(square('e5')).not.toHaveClass('board__square--target-hover')
  })

  it('returns the piece when released off target', async () => {
    const { user, onMove } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('e5'), coords: pt('e5') },
      { keys: '[/MouseLeft]', target: square('e5'), coords: pt('e5') },
    ])
    expect(onMove).not.toHaveBeenCalled()
    expect(lifted()).toHaveClass('board__lifted--returning')
    await waitFor(() => expect(lifted()).toBeNull())
    expect(square('c3').querySelector('.piece')).not.toBeNull()
  })

  it('cancels the drag on Escape', async () => {
    const { user, onMove } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('d4'), coords: pt('d4') },
    ])
    await user.keyboard('{Escape}')
    expect(lifted()).toHaveClass('board__lifted--returning')

    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('d4'),
      coords: pt('d4'),
    })
    expect(onMove).not.toHaveBeenCalled()
    await waitFor(() => expect(lifted()).toBeNull())
  })

  it('treats press and release without movement as a tap', async () => {
    const { user, onSquareTap, onSelect, onMove } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { keys: '[/MouseLeft]', target: square('c3'), coords: pt('c3') },
    ])
    expect(onSquareTap).toHaveBeenCalledTimes(1)
    expect(onSquareTap).toHaveBeenCalledWith(squareFromName('c3'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
    expect(lifted()).toBeNull()
  })

  it('does not lift pieces of the side not to move', async () => {
    const { user, onSelect } = renderBoard()

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('f6'), coords: pt('f6') },
      { target: square('e5'), coords: pt('e5') },
    ])
    expect(lifted()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still taps via keyboard activation', async () => {
    const { user, onSquareTap } = renderBoard()

    square('c3').focus()
    await user.keyboard('{Enter}')
    expect(onSquareTap).toHaveBeenCalledTimes(1)
  })
})

describe('recovering from a lost pointerup', () => {
  it('accepts a new press after a previous press never released', async () => {
    const { user, onSquareTap } = renderBoard()

    // A press whose release never arrives (pointer let go outside the window).
    fireEvent.pointerDown(square('d4'), {
      pointerId: 1,
      button: 0,
      clientX: pt('d4').x,
      clientY: pt('d4').y,
    })

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { keys: '[/MouseLeft]', target: square('c3'), coords: pt('c3') },
    ])
    expect(onSquareTap).toHaveBeenCalledWith(squareFromName('c3'))
  })
})

describe('grab offset and drop tolerance', () => {
  it('lifts the piece where it was grabbed instead of jumping to the pointer', async () => {
    const { user } = renderBoard()
    // Grab c3 near its top-right corner and move one cell right.
    const grab = { x: pt('c3').x + 30, y: pt('c3').y - 30 }
    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: grab },
      { target: square('d3'), coords: { x: grab.x + CELL, y: grab.y } },
    ])
    // The piece centre is one cell right of c3's centre: over d3.
    const el = lifted() as HTMLElement
    const expected = `translate(${pt('d3').x - CELL / 2}px, ${pt('d3').y - CELL / 2}px)`
    expect(el.style.transform).toBe(expected)
  })

  it('drops on the square under the piece, not under the pointer', async () => {
    const { user, onMove } = renderBoard()
    // Grabbed at the bottom edge of c3, the pointer ends just inside d3
    // while the piece itself sits on d4.
    const grab = { x: pt('c3').x, y: pt('c3').y + 40 }
    const release = { x: pt('d4').x, y: pt('d4').y + 40 }
    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: grab },
      { target: square('d3'), coords: release },
    ])
    expect(square('d4')).toHaveClass('board__square--target-hover')
    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('d3'),
      coords: release,
    })
    expect(onMove).toHaveBeenCalledWith(
      squareFromName('c3'),
      squareFromName('d4'),
    )
  })

  it('lands on the edge square when dropped half past the frame', async () => {
    const { user, onMove } = renderBoard()
    const outside = { x: pt('b4').x - 2 * CELL + 10, y: pt('b4').y }
    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('a4'), coords: { x: pt('b4').x - CELL, y: pt('b4').y } },
      { target: square('a4'), coords: outside },
    ])
    // Piece centre is 40px left of the board: within half a cell of a4,
    // which is not a target here, so nothing is highlighted.
    expect(square('b4')).not.toHaveClass('board__square--target-hover')
    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('a4'),
      coords: outside,
    })
    expect(onMove).not.toHaveBeenCalled()
  })

  it('drops onto a target edge square from just past the frame', async () => {
    const onMove = vi.fn()
    render(
      <Board
        position={initialPosition()}
        orientation="white"
        targets={[squareFromName('a5')]}
        onMove={onMove}
      />,
    )
    const user = userEvent.setup()
    const outside = { x: pt('a5').x - CELL / 2 - 20, y: pt('a5').y }
    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('a5'), coords: outside },
    ])
    expect(square('a5')).toHaveClass('board__square--target-hover')
    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('a5'),
      coords: outside,
    })
    expect(onMove).toHaveBeenCalledWith(
      squareFromName('c3'),
      squareFromName('a5'),
    )
  })

  it('returns the piece when dropped well outside the board', async () => {
    const { user, onMove } = renderBoard()
    const far = { x: -200, y: pt('c3').y }
    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('a3'), coords: far },
      { keys: '[/MouseLeft]', target: square('a3'), coords: far },
    ])
    expect(onMove).not.toHaveBeenCalled()
    expect(lifted()).toHaveClass('board__lifted--returning')
  })
})

describe('touch', () => {
  it('needs more travel than a mouse before a press becomes a drag', () => {
    const { onSelect } = renderBoard()
    const down = (x: number, y: number) =>
      fireEvent.pointerDown(square('c3'), {
        pointerId: 7,
        pointerType: 'touch',
        button: 0,
        clientX: x,
        clientY: y,
      })
    const move = (x: number, y: number) =>
      fireEvent.pointerMove(window, {
        pointerId: 7,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      })

    down(pt('c3').x, pt('c3').y)
    move(pt('c3').x + 6, pt('c3').y)
    expect(lifted()).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()

    move(pt('c3').x + 9, pt('c3').y)
    expect(lifted()).toHaveClass('board__lifted--dragging')
    expect(onSelect).toHaveBeenCalledWith(squareFromName('c3'))
  })
})

describe('losing the pointer mid-drag', () => {
  async function startDrag(user: ReturnType<typeof userEvent.setup>) {
    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('d4'), coords: pt('d4') },
    ])
    expect(lifted()).toHaveClass('board__lifted--dragging')
  }

  it('returns the piece when the window loses focus', async () => {
    const { user, onMove } = renderBoard()
    await startDrag(user)

    fireEvent.blur(window)
    expect(lifted()).toHaveClass('board__lifted--returning')
    await waitFor(() => expect(lifted()).toBeNull())
    expect(onMove).not.toHaveBeenCalled()
  })

  it('returns the piece when pointer capture is lost', async () => {
    const { user } = renderBoard()
    await startDrag(user)

    fireEvent.lostPointerCapture(document.querySelector('.board__grid')!, {
      pointerId: 1,
    })
    expect(lifted()).toHaveClass('board__lifted--returning')
  })

  it('lets the same pointer start over after its release went missing', async () => {
    const { user, onMove } = renderBoard()
    // A drag whose pointerup never arrives.
    fireEvent.pointerDown(square('c3'), {
      pointerId: 1,
      button: 0,
      clientX: pt('c3').x,
      clientY: pt('c3').y,
    })
    fireEvent.pointerMove(window, {
      pointerId: 1,
      clientX: pt('d4').x,
      clientY: pt('d4').y,
    })
    expect(lifted()).toHaveClass('board__lifted--dragging')

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('e3'), coords: pt('e3') },
      { target: square('d4'), coords: pt('d4') },
      { keys: '[/MouseLeft]', target: square('d4'), coords: pt('d4') },
    ])
    expect(onMove).toHaveBeenCalledWith(
      squareFromName('e3'),
      squareFromName('d4'),
    )
  })

  it('ignores a second finger while the first is dragging', async () => {
    const { user, onMove } = renderBoard()
    await startDrag(user)

    fireEvent.pointerDown(square('e3'), {
      pointerId: 2,
      pointerType: 'touch',
      button: 0,
      clientX: pt('e3').x,
      clientY: pt('e3').y,
    })
    fireEvent.pointerUp(window, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: pt('e3').x,
      clientY: pt('e3').y,
    })
    // The original drag is still alive and completes normally.
    expect(lifted()).toHaveClass('board__lifted--dragging')
    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('d4'),
      coords: pt('d4'),
    })
    expect(onMove).toHaveBeenCalledWith(
      squareFromName('c3'),
      squareFromName('d4'),
    )
  })
})
