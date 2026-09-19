import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { parseCorners } from '../corners/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { displayCell, squareFromName } from '../game/board.ts'
import { personas } from '../opponents/personas.ts'
import { thinkWith } from '../opponents/think.ts'
import type { ThinkRequest, ThinkResponse } from '../opponents/think.ts'
import { DirectThinker } from '../opponents/direct.ts'
import type { Thinker } from '../opponents/thinker.ts'
import type { GameSetup } from '../state/gameReducer.ts'
import { Page } from './Page.tsx'
import { captureAnimations } from './testAnimations.ts'

/** Sound is decoration; the tests only check when it is asked for. */
const sound = vi.hoisted(() => ({
  playMove: vi.fn(),
  preloadMoveSound: vi.fn(),
  // The navbar's toggle, which comes with `Page`.
  isSoundOn: () => true,
  setSoundOn: vi.fn(),
}))
vi.mock('../sound/sound.ts', () => sound)

const square = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name},`) })
const moveButtons = () =>
  screen.queryAllByRole('button', { name: /^[a-h][1-8][-:][a-h][1-8]/ })
/** The opponent's speech bubble; the live region repeats what is in it. */
const bubble = () => document.querySelector('.opponent__bubble')
/** The move list, which is not the only list on the page: the navbar has tabs. */
const movesPlayed = () => within(screen.getByRole('list', { name: 'Ходы' }))

/** Shallow, instant and deterministic replies for the persona tests. */
const shallow = { depth: 2, budgetMs: 0, minThinkMs: 0 }
const fast = new DirectThinker(shallow)
/** Two humans: the tests that play both colours use this. */
const hotSeat = {
  initialSetup: {
    variant: 'checkers',
    opponentId: 'friend',
    humanColor: 'both',
  } as GameSetup,
  thinker: fast,
}

/** Holds every request until the test answers it. */
class ManualThinker implements Thinker {
  requests: { request: ThinkRequest; resolve: (r: ThinkResponse) => void }[] =
    []
  cancelled = 0

  think(request: ThinkRequest): Promise<ThinkResponse> {
    return new Promise((resolve) => {
      this.requests.push({ request, resolve })
    })
  }

  cancel(): void {
    this.cancelled++
    this.requests = []
  }

  dispose(): void {}

  /** The reply the real search would give to the latest request. */
  replyTo({ request }: { request: ThinkRequest }): ThinkResponse {
    return thinkWith(request, { ...personas[request.persona], ...shallow })
  }
}

describe('GameScreen: tap to move', () => {
  it('shows targets after tapping an own piece', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))

    expect(square('c3')).toHaveClass('board__square--selected')
    expect(square('d4')).toHaveClass('board__square--target')
    expect(square('d4')).toHaveAccessibleName('d4, пустое поле, ход возможен')
    expect(square('e3')).not.toHaveClass('board__square--target')
  })

  it('moves the piece when a target is tapped and passes the turn', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))
    await user.click(square('d4'))

    expect(square('d4')).toHaveAccessibleName('d4, белая шашка')
    expect(square('c3')).toHaveAccessibleName('c3, пустое поле')
    expect(square('d4')).not.toHaveClass('board__square--selected')
    expect(screen.queryAllByRole('button', { name: /ход возможен/ })).toEqual(
      [],
    )

    // Black to move now: white cannot be selected, black can.
    await user.click(square('d4'))
    expect(square('d4')).not.toHaveClass('board__square--selected')
    await user.click(square('f6'))
    expect(square('f6')).toHaveClass('board__square--selected')
  })

  it('deselects when a non-target square is tapped', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))
    await user.click(square('f6'))

    expect(square('c3')).not.toHaveClass('board__square--selected')
    expect(screen.queryAllByRole('button', { name: /ход возможен/ })).toEqual(
      [],
    )
  })

  it('does nothing when an opponent piece is tapped with no selection', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('f6'))

    expect(square('f6')).not.toHaveClass('board__square--selected')
    expect(screen.queryAllByRole('button', { name: /ход возможен/ })).toEqual(
      [],
    )
  })

  it('marks pieces of the side to move as movable', () => {
    render(<Page {...hotSeat} />)
    expect(square('c3')).toHaveClass('board__square--movable')
    expect(square('f6')).not.toHaveClass('board__square--movable')
  })

  it('accepts low-level pointer press and release as a tap', async () => {
    // Proves the pointer API works in this environment before Task 4 relies on it.
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3') },
      { keys: '[/MouseLeft]', target: square('c3') },
    ])

    expect(square('c3')).toHaveClass('board__square--selected')
  })
})

describe('GameScreen: drag to move', () => {
  it('moves a piece dragged onto a target', async () => {
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
    const pt = (name: string) => {
      const { row, col } = displayCell(squareFromName(name), 'white')
      return { x: col * 100 + 50, y: row * 100 + 50 }
    }
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('d4'), coords: pt('d4') },
    ])
    // Lifting selects the piece so its targets show while dragging.
    expect(square('c3')).toHaveClass('board__square--selected')
    expect(square('d4')).toHaveClass('board__square--target-hover')

    await user.pointer({
      keys: '[/MouseLeft]',
      target: square('d4'),
      coords: pt('d4'),
    })
    expect(square('d4')).toHaveAccessibleName('d4, белая шашка')
    expect(square('c3')).toHaveAccessibleName('c3, пустое поле')
    vi.restoreAllMocks()
  })
})

describe('GameScreen: captures', () => {
  it('forces the capture and removes the captured piece', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await user.click(square('c3'))
    await user.click(square('d4'))
    await user.click(square('f6'))
    await user.click(square('e5'))

    // White must take: d4 is the only movable piece and f6 its only target.
    expect(square('e3')).not.toHaveClass('board__square--movable')
    await user.click(square('e3'))
    expect(square('e3')).not.toHaveClass('board__square--selected')
    await user.click(square('d4'))
    expect(
      screen.getAllByRole('button', { name: /ход возможен/ }),
    ).toHaveLength(1)
    await user.click(square('f6'))

    expect(square('f6')).toHaveAccessibleName('f6, белая шашка')
    expect(square('e5')).toHaveAccessibleName('e5, пустое поле')
    expect(square('d4')).toHaveAccessibleName('d4, пустое поле')
    expect(screen.getByRole('button', { name: 'd4:f6' })).toBeInTheDocument()
    // The turn passed: White's men are no longer the ones that may move.
    expect(square('f6')).not.toHaveClass('board__square--movable')
  })
})

describe('GameScreen: last move', () => {
  const pieceBox = (name: string) => square(name).querySelector('.board__piece')
  const animations = captureAnimations()

  it('highlights origin and destination after a tap move and slides the piece', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))
    await user.click(square('d4'))

    expect(square('c3')).toHaveClass('board__square--last-from')
    expect(square('d4')).toHaveClass('board__square--last-to')
    const box = pieceBox('d4')
    expect(box).toHaveClass('board__piece--arrived')
    // c3 is one column left and one row below d4 on a white-bottom board.
    expect(animations.of(box)).toEqual([
      'translate(-100%, 100%)',
      'translate(0%, 0%)',
    ])
  })

  it('keeps the piece flying while the persona starts thinking', async () => {
    const user = userEvent.setup()
    const thinker = new ManualThinker()
    render(
      <Page
        initialSetup={{
          variant: 'checkers',
          opponentId: 'fox',
          humanColor: 'white',
        }}
        thinker={thinker}
      />,
    )

    await user.click(square('c3'))
    await user.click(square('d4'))
    await waitFor(() => expect(thinker.requests).toHaveLength(1))

    // Asking for the reply clears the selection, not the flight in progress.
    const box = pieceBox('d4')
    expect(box).toHaveClass('board__piece--arrived')
    expect(animations.live(box)).toHaveLength(1)
  })

  it('has no highlight before the first move', () => {
    render(<Page {...hotSeat} />)
    expect(document.querySelector('.board__square--last-from')).toBeNull()
    expect(document.querySelector('.board__square--last-to')).toBeNull()
  })

  it('does not slide a dragged piece', async () => {
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
    const pt = (name: string) => {
      const { row, col } = displayCell(squareFromName(name), 'white')
      return { x: col * 100 + 50, y: row * 100 + 50 }
    }
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.pointer([
      { keys: '[MouseLeft>]', target: square('c3'), coords: pt('c3') },
      { target: square('d4'), coords: pt('d4') },
      { keys: '[/MouseLeft]', target: square('d4'), coords: pt('d4') },
    ])

    expect(square('d4')).toHaveClass('board__square--last-to')
    // The piece is still settling in the overlay; either way nothing slides.
    expect(document.querySelector('.board__piece--arrived')).toBeNull()
    expect(animations.all()).toHaveLength(0)
    vi.restoreAllMocks()
  })
})

describe('GameScreen: a position to start from', () => {
  const animations = captureAnimations()
  // Two loops out of d2: both go over c3 to b4, c5 to d6 and e5 to f4, and
  // only the last jump differs (over e3 back to d2, or over g3 to h2).
  const loops = fromBitPosition(parsePos('W:Wd2:Bc3,e3,c5,e5,g3'))

  it('takes the forced jumps at once and flies the piece over them', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={loops} />)

    await user.click(square('d2'))
    await user.click(square('b4'))

    // The piece is on f4 already; only the last jump is left to choose.
    const box = square('f4').querySelector('.board__piece')
    expect(box).toHaveClass('board__piece--arrived')
    expect(animations.of(box)).toEqual([
      'translate(-200%, 200%)', // d2
      'translate(-400%, 0%)', // b4
      'translate(-200%, -200%)', // d6
      'translate(0%, 0%)', // f4
    ])
    expect(square('d2')).toHaveClass('board__square--target')
    expect(square('h2')).toHaveClass('board__square--target')
    expect(square('d6')).not.toHaveClass('board__square--target')
    // Captured men stay put until the move is over.
    expect(square('c5')).toHaveAccessibleName(/чёрная шашка/)
    expect(moveButtons()).toHaveLength(0)
  })

  it('finishes on the square that tells the loops apart', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={loops} />)

    await user.click(square('d2'))
    await user.click(square('b4'))
    await user.click(square('h2'))

    expect(
      screen.getByRole('button', { name: 'd2:b4:d6:f4:h2' }),
    ).toBeInTheDocument()
    expect(square('c5')).toHaveAccessibleName('c5, пустое поле')
    // Only the leg it had left to cover is flown.
    expect(animations.of(square('h2').querySelector('.board__piece'))).toEqual([
      'translate(-200%, -200%)', // f4
      'translate(0%, 0%)', // h2
    ])
  })
})

describe('GameScreen: move list and undo', () => {
  it('records moves and undoes with the keyboard', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))
    await user.click(square('d4'))
    await user.click(square('f6'))
    await user.click(square('e5'))
    expect(movesPlayed().getByRole('listitem')).toHaveTextContent(
      '1.c3-d4f6-e5',
    )

    await user.keyboard('{Control>}z{/Control}')
    expect(square('f6')).toHaveAccessibleName('f6, чёрная шашка')
    expect(square('c3')).toHaveClass('board__square--last-from')
    expect(screen.getByRole('button', { name: 'Вернуть ход' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Вернуть ход' }))
    expect(square('e5')).toHaveAccessibleName('e5, чёрная шашка')
  })
})

describe('GameScreen: review mode', () => {
  async function playThree(user: ReturnType<typeof userEvent.setup>) {
    // f6-g5 rather than f6-e5: after f6-e5 white would have to capture.
    for (const [from, to] of [
      ['c3', 'd4'],
      ['f6', 'g5'],
      ['e3', 'f4'],
    ]) {
      await user.click(square(from!))
      await user.click(square(to!))
    }
  }

  it('shows an earlier position when a move is clicked', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await playThree(user)

    await user.click(screen.getByRole('button', { name: 'c3-d4' }))

    expect(square('f6')).toHaveAccessibleName('f6, чёрная шашка')
    expect(square('e3')).toHaveAccessibleName('e3, белая шашка')
    expect(screen.getByText('просмотр')).toBeInTheDocument()
    expect(document.querySelector('.board')).toHaveClass('board--review')
    expect(screen.getByRole('button', { name: 'c3-d4' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('returns to the latest position', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await playThree(user)
    await user.click(screen.getByRole('button', { name: 'c3-d4' }))

    await user.click(screen.getByRole('button', { name: 'К текущей позиции' }))

    expect(square('f4')).toHaveAccessibleName('f4, белая шашка')
    expect(screen.queryByText('просмотр')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'К текущей позиции' }),
    ).toBeNull()
  })

  it('a move made while reviewing replaces the rest of the game', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await playThree(user)
    await user.click(screen.getByRole('button', { name: 'c3-d4' }))

    await user.click(square('d6'))
    await user.click(square('c5'))

    const items = movesPlayed().getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('1.c3-d4d6-c5')
    expect(screen.queryByText('просмотр')).toBeNull()
  })
})

describe('GameScreen: orientation', () => {
  it('flips the board against a persona too', async () => {
    const user = userEvent.setup()
    render(<Page thinker={fast} />)

    await user.click(screen.getByRole('button', { name: 'Перевернуть доску' }))

    expect(
      screen.getAllByRole('button', { name: /^[a-h][1-8],/ })[0],
    ).toHaveAccessibleName(/^h1,/)
  })

  it('flips the board in a two-player game', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await user.click(screen.getByRole('button', { name: 'Новая игра' }))
    await user.click(screen.getByRole('radio', { name: /Друг рядом/ }))
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(
      screen.getAllByRole('button', { name: /^[a-h][1-8],/ })[0],
    ).toHaveAccessibleName(/^a8,/)

    await user.click(screen.getByRole('button', { name: 'Перевернуть доску' }))

    expect(
      screen.getAllByRole('button', { name: /^[a-h][1-8],/ })[0],
    ).toHaveAccessibleName(/^h1,/)
    // Still white to move and still playable after flipping.
    await user.click(square('c3'))
    expect(square('c3')).toHaveClass('board__square--selected')
  })
})

describe('GameScreen: opponent header', () => {
  it('keeps the bubble empty while the game says nothing', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    expect(screen.getByRole('heading', { name: 'Друг рядом' })).toBeVisible()
    expect(bubble()).toBeNull()
    // Drawn nowhere, but still said: the board shows the turn in colour.
    expect(screen.getByRole('status')).toHaveTextContent(/^Ход белых$/)

    await user.click(square('c3'))
    await user.click(square('d4'))
    expect(bubble()).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/^Ход чёрных$/)
  })

  it('remarks on a capture the persona is pleased with', async () => {
    const user = userEvent.setup()
    // The king on h8 blocks White's own capture of g7; once White has moved
    // out of the corner, Black's only reply takes f6 and d4 together.
    const feast = fromBitPosition(parsePos('W:Wd4,f6,h2,Kh8:Bg7'))
    render(<Page initialPosition={feast} thinker={fast} seed={() => 1} />)

    await user.click(square('h2'))
    await user.click(square('g3'))

    expect(await screen.findByText('Вкусно!')).toBeInTheDocument()
  })
})

describe('GameScreen: new game', () => {
  it('starts against the fox as white by default', () => {
    render(<Page thinker={fast} />)
    expect(screen.getByRole('heading', { name: 'Лиса' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /^[a-h][1-8],/ })[0],
    ).toHaveAccessibleName(/^a8,/)
  })

  it('starts a new game from the dialog and orients the board', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await user.click(square('c3'))
    await user.click(square('d4'))

    await user.click(screen.getByRole('button', { name: 'Новая игра' }))
    await user.click(screen.getByRole('radio', { name: /Лиса/ }))
    await user.click(screen.getByRole('radio', { name: 'Чёрные' }))
    await user.click(screen.getByRole('button', { name: 'Начать' }))

    expect(screen.getByRole('heading', { name: 'Лиса' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: /^[a-h][1-8],/ })[0],
    ).toHaveAccessibleName(/^h1,/)
    // Лиса has the white pieces and opens at once.
    await waitFor(() => expect(moveButtons()).toHaveLength(1))
  })

  it('keeps the current game when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)
    await user.click(square('c3'))
    await user.click(square('d4'))

    await user.click(screen.getByRole('button', { name: 'Новая игра' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(movesPlayed().getByRole('listitem')).toHaveTextContent('1.c3-d4')
  })
})

describe('GameScreen: keyboard play', () => {
  it('moves focus with the arrow keys and moves a piece with Enter', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    square('c3').focus()
    await user.keyboard('{ArrowUp}')
    expect(square('c4')).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(square('d4')).toHaveFocus()
    await user.keyboard('{ArrowDown}{ArrowLeft}')
    expect(square('c3')).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(square('c3')).toHaveClass('board__square--selected')
    await user.keyboard('{ArrowUp}{ArrowRight}{Enter}')
    expect(square('d4')).toHaveAccessibleName('d4, белая шашка')
  })

  it('keeps focus on the board at the edges', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    square('a1').focus()
    await user.keyboard('{ArrowLeft}{ArrowDown}')
    expect(square('a1')).toHaveFocus()
  })

  it('deselects with Escape', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))
    expect(square('c3')).toHaveClass('board__square--selected')
    await user.keyboard('{Escape}')
    expect(square('c3')).not.toHaveClass('board__square--selected')
  })

  it('puts only one square in the tab order', () => {
    render(<Page {...hotSeat} />)
    const inTabOrder = screen
      .getAllByRole('button', { name: /^[a-h][1-8],/ })
      .filter((b) => b.getAttribute('tabindex') !== '-1')
    expect(inTabOrder).toHaveLength(1)
  })
})

describe('GameScreen: computer opponent', () => {
  it('answers a human move', async () => {
    const user = userEvent.setup()
    render(<Page thinker={fast} seed={() => 1} />)

    await user.click(square('c3'))
    await user.click(square('d4'))

    await waitFor(() => expect(moveButtons()).toHaveLength(2))
    expect(
      document.querySelectorAll('.board__square--movable').length,
    ).toBeGreaterThan(0)
  })

  it('opens the game when the human plays black', async () => {
    render(
      <Page
        initialSetup={{
          variant: 'checkers',
          opponentId: 'hare',
          humanColor: 'black',
        }}
        thinker={fast}
        seed={() => 1}
      />,
    )
    await waitFor(() => expect(moveButtons()).toHaveLength(1))
  })

  it('says the persona is thinking and blocks the board until the reply', async () => {
    const user = userEvent.setup()
    const manual = new ManualThinker()
    render(<Page thinker={manual} seed={() => 1} />)

    await user.click(square('c3'))
    await user.click(square('d4'))

    expect(screen.getByRole('status')).toHaveTextContent('Лиса думает…')
    expect(document.querySelectorAll('.board__square--movable')).toHaveLength(0)
    expect(manual.requests).toHaveLength(1)
    expect(manual.requests[0]!.request.persona).toBe('fox')

    await act(async () => {
      manual.requests[0]!.resolve(manual.replyTo(manual.requests[0]!))
    })
    await waitFor(() => expect(moveButtons()).toHaveLength(2))
    expect(screen.getByRole('status')).toHaveTextContent('Ход белых · вы')
  })

  it('undo while the persona thinks takes back the human move and cancels', async () => {
    const user = userEvent.setup()
    const manual = new ManualThinker()
    render(<Page thinker={manual} seed={() => 1} />)
    await user.click(square('c3'))
    await user.click(square('d4'))
    const stale = manual.requests[0]!

    await user.keyboard('{Control>}z{/Control}')

    expect(square('c3')).toHaveAccessibleName('c3, белая шашка')
    expect(square('d4')).toHaveAccessibleName('d4, пустое поле')
    expect(manual.cancelled).toBe(1)

    // A reply that still arrives is dropped.
    await act(async () => {
      stale.resolve(manual.replyTo(stale))
    })
    expect(moveButtons()).toHaveLength(1)
    expect(square('c3')).toHaveAccessibleName('c3, белая шашка')
    expect(square('d4')).toHaveAccessibleName('d4, пустое поле')
  })

  it('undo takes back the reply with the human move and redo brings both back', async () => {
    const user = userEvent.setup()
    render(<Page thinker={fast} seed={() => 1} />)
    await user.click(square('c3'))
    await user.click(square('d4'))
    await waitFor(() => expect(moveButtons()).toHaveLength(2))

    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    // Both moves are taken back; they stay in the list for redo.
    expect(square('c3')).toHaveAccessibleName('c3, белая шашка')
    expect(square('d4')).toHaveAccessibleName('d4, пустое поле')
    expect(screen.getByText('просмотр')).toBeInTheDocument()
    expect(moveButtons()).toHaveLength(2)

    // Redo steps one ply at a time: the human move first, then the reply.
    await user.click(screen.getByRole('button', { name: 'Вернуть ход' }))
    expect(square('d4')).toHaveAccessibleName('d4, белая шашка')
    expect(screen.getByText('просмотр')).toBeInTheDocument()
    expect(document.querySelectorAll('.board__square--movable')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Вернуть ход' }))
    expect(screen.queryByText('просмотр')).toBeNull()
    expect(screen.getByRole('button', { name: 'Вернуть ход' })).toBeDisabled()
  })

  it('plays the opening move under StrictMode when the human is black', async () => {
    render(
      <StrictMode>
        <Page
          initialSetup={{
            variant: 'checkers',
            opponentId: 'hare',
            humanColor: 'black',
          }}
          thinker={fast}
          seed={() => 1}
        />
      </StrictMode>,
    )
    await waitFor(() => expect(moveButtons()).toHaveLength(1))
  })

  it('gives up after two failed requests and leaves the board usable', async () => {
    const user = userEvent.setup()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken: Thinker = {
      think: () => Promise.reject(new Error('worker down')),
      cancel: () => {},
      dispose: () => {},
    }
    render(<Page thinker={broken} seed={() => 1} />)

    await user.click(square('c3'))
    await user.click(square('d4'))

    await waitFor(() => expect(errors).toHaveBeenCalledTimes(2))
    // Nothing is being searched any more, so the ring goes with the words.
    expect(screen.getByRole('status')).toHaveTextContent(/^Ход чёрных · Лиса$/)
    expect(screen.getByRole('button', { name: 'Отменить ход' })).toBeEnabled()
    expect(document.querySelector('.board__grid')).not.toHaveAttribute(
      'aria-busy',
    )
    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    expect(square('c3')).toHaveAccessibleName('c3, белая шашка')
    expect(errors).toHaveBeenCalledTimes(2)
    errors.mockRestore()
  })

  it('rejects an illegal reply and stops asking after the second one', async () => {
    const user = userEvent.setup()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    // A white move from another position: never legal for Black's reply.
    const opening = thinkWith(
      {
        id: 0,
        variant: 'checkers',
        position: 'W:Wc3:Bf6',
        persona: 'hare',
        seed: 1,
      },
      { ...personas.hare, ...shallow },
    ).move
    const stuck: Thinker = {
      think: (request) =>
        Promise.resolve({
          id: request.id,
          move: opening,
          score: 0,
          depth: 1,
          nodes: 1,
          ms: 0,
        }),
      cancel: () => {},
      dispose: () => {},
    }
    render(<Page thinker={stuck} seed={() => 1} />)

    await user.click(square('c3'))
    await user.click(square('d4'))

    await waitFor(() => expect(errors).toHaveBeenCalledTimes(2))
    expect(moveButtons()).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(/^Ход чёрных · Лиса$/)
    errors.mockRestore()
  })

  it('marks the board busy while the persona thinks', async () => {
    const user = userEvent.setup()
    const manual = new ManualThinker()
    render(<Page thinker={manual} seed={() => 1} />)
    await user.click(square('c3'))
    await user.click(square('d4'))
    expect(document.querySelector('.board__grid')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})

describe('GameScreen: move sound', () => {
  it('clicks once per move and stays quiet while navigating', async () => {
    const user = userEvent.setup()
    sound.playMove.mockClear()
    render(<Page {...hotSeat} />)

    await user.click(square('c3'))
    await user.click(square('d4'))
    expect(sound.playMove).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть ход' }))
    expect(sound.playMove).toHaveBeenCalledTimes(1)
  })
})

describe('GameScreen: the clock', () => {
  /** Two humans on a clock, with time the test moves by hand. */
  function timed(timeControlId: 'none' | '1+0' | '3+2') {
    return {
      initialSetup: {
        variant: 'checkers',
        opponentId: 'friend',
        humanColor: 'both',
        timeControlId,
      } as GameSetup,
      thinker: fast,
    }
  }

  /** The readout of one side, as the element that carries its classes. */
  function readout(label: string): HTMLElement {
    const found = screen.getByText(label).parentElement
    if (found === null) throw new Error(`no readout for ${label}`)
    return found
  }

  it('shows no readouts in an untimed game', () => {
    render(<Page {...hotSeat} />)
    expect(screen.queryByText('Время белых')).toBeNull()
  })

  it('counts the side to move down, then hands the clock over', async () => {
    // Real timers: `user-event` and fake timers deadlock in this suite, so
    // the tick runs for real and only the clock it reads is under control.
    let clock = 0
    const user = userEvent.setup()
    render(<Page {...timed('3+2')} now={() => clock} />)
    expect(readout('Время белых')).toHaveTextContent('3:00')
    expect(readout('Время чёрных')).toHaveTextContent('3:00')

    clock = 5_000
    // The tick runs every 100 ms; a loaded machine may miss a few, so the
    // wait is generous rather than exact.
    await waitFor(
      () => expect(readout('Время белых')).toHaveTextContent('2:55'),
      { timeout: 3_000 },
    )
    expect(readout('Время белых')).toHaveClass('clocks__row--running')
    expect(readout('Время чёрных')).toHaveTextContent('3:00')

    await user.click(square('c3'))
    await user.click(square('d4'))

    // Charged five seconds, given the two-second increment back.
    expect(readout('Время белых')).toHaveTextContent('2:57')
    expect(readout('Время чёрных')).toHaveClass('clocks__row--running')

    clock = 15_000
    await waitFor(
      () => expect(readout('Время чёрных')).toHaveTextContent('2:50'),
      { timeout: 3_000 },
    )
    expect(readout('Время белых')).toHaveTextContent('2:57')
  })

  it('gives the persona a budget out of its own bank', async () => {
    const manual = new ManualThinker()
    render(
      <Page
        initialSetup={{
          variant: 'checkers',
          opponentId: 'raven',
          humanColor: 'black',
          timeControlId: '1+0',
        }}
        thinker={manual}
        seed={() => 1}
        now={() => 0}
      />,
    )

    await waitFor(() => expect(manual.requests).toHaveLength(1))
    const request = manual.requests[0]!.request
    // Raven would spend three seconds; a fortieth of a minute is 1.5.
    expect(request.budgetMs).toBe(1_500)
    expect(request.minThinkMs).toBe(personas.raven.minThinkMs)
  })

  it('sends no budget of its own in an untimed game', async () => {
    const manual = new ManualThinker()
    render(
      <Page
        initialSetup={{
          variant: 'checkers',
          opponentId: 'raven',
          humanColor: 'black',
        }}
        thinker={manual}
        seed={() => 1}
      />,
    )

    await waitFor(() => expect(manual.requests).toHaveLength(1))
    expect(manual.requests[0]!.request.budgetMs).toBeUndefined()
    expect(manual.requests[0]!.request.minThinkMs).toBeUndefined()
  })

  it('ends the game on time while the persona is still searching', async () => {
    let clock = 0
    const manual = new ManualThinker()
    render(
      <Page
        initialSetup={{
          variant: 'checkers',
          opponentId: 'raven',
          humanColor: 'black',
          timeControlId: '1+0',
        }}
        thinker={manual}
        seed={() => 1}
        now={() => clock}
      />,
    )
    await waitFor(() => expect(manual.requests).toHaveLength(1))
    const pending = manual.requests[0]!

    clock = 60_100
    await waitFor(
      () => expect(bubble()).toHaveTextContent('Победа чёрных по времени'),
      { timeout: 3_000 },
    )
    expect(manual.cancelled).toBe(1)

    // A reply that still arrives belongs to a game that is already lost.
    await act(async () => {
      pending.resolve(manual.replyTo(pending))
    })
    expect(moveButtons()).toHaveLength(0)
  })

  it('ends the game on time and stops taking moves', async () => {
    let clock = 0
    const user = userEvent.setup()
    render(<Page {...timed('1+0')} now={() => clock} />)

    clock = 60_100
    await waitFor(
      () => expect(bubble()).toHaveTextContent('Победа чёрных по времени'),
      { timeout: 3_000 },
    )
    expect(readout('Время белых')).toHaveTextContent('0.0')
    expect(readout('Время белых')).toHaveClass('clocks__row--flagged')

    await user.click(square('c3'))
    expect(square('c3')).not.toHaveClass('board__square--selected')
    expect(moveButtons()).toHaveLength(0)
  })
})

describe('GameScreen: result screen', () => {
  /** One capture ends it: Black has nothing left. */
  const decided = fromBitPosition(parsePos('W:Wc3:Bd4'))

  it('shows the result as soon as the game ends', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={decided} />)
    await user.click(square('c3'))
    await user.click(square('e5'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Победа белых' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Шашек не осталось')).toBeInTheDocument()
  })

  it('reopens the result from the bubble once it is closed', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={decided} />)
    await user.click(square('c3'))
    await user.click(square('e5'))
    await user.click(await screen.findByRole('button', { name: 'Закрыть' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Итог партии' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('does not reopen it for stepping back through the finished game', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={decided} />)
    await user.click(square('c3'))
    await user.click(square('e5'))
    await user.click(await screen.findByRole('button', { name: 'Закрыть' }))

    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть ход' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows it again when the game is taken back and lost differently', async () => {
    const user = userEvent.setup()
    // Black's man on a1 has nowhere to go, so either White move ends it.
    const trapped = fromBitPosition(parsePos('W:Wc3:Ba1'))
    render(<Page {...hotSeat} initialPosition={trapped} />)
    await user.click(square('c3'))
    await user.click(square('b4'))
    await user.click(await screen.findByRole('button', { name: 'Закрыть' }))

    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    await user.click(square('c3'))
    await user.click(square('d4'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('keeps the result out of the bubble while an earlier position is shown', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={decided} />)
    await user.click(square('c3'))
    await user.click(square('e5'))
    await user.click(await screen.findByRole('button', { name: 'Закрыть' }))
    expect(bubble()).toHaveTextContent('Победа белых')

    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    expect(bubble()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'К текущей позиции' }))
    expect(bubble()).toHaveTextContent('Победа белых')
  })

  it('opens the new-game dialog from the result screen', async () => {
    const user = userEvent.setup()
    render(<Page {...hotSeat} initialPosition={decided} />)
    await user.click(square('c3'))
    await user.click(square('e5'))
    const result = await screen.findByRole('dialog')
    await user.click(within(result).getByRole('button', { name: 'Новая игра' }))

    expect(
      await screen.findByRole('heading', { name: 'Новая игра' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Победа белых' })).toBeNull()
  })
})

describe('GameScreen: поддавки', () => {
  it('tells the persona which game it is playing', async () => {
    const user = userEvent.setup()
    const thinker = new ManualThinker()
    render(
      <Page
        initialSetup={{
          variant: 'giveaway',
          opponentId: 'fox',
          humanColor: 'white',
        }}
        thinker={thinker}
      />,
    )

    await user.click(square('c3'))
    await user.click(square('d4'))
    await waitFor(() => expect(thinker.requests).toHaveLength(1))

    expect(thinker.requests[0]!.request.variant).toBe('giveaway')
  })

  it('plays a game out to a поддавки win against a persona', async () => {
    const user = userEvent.setup()
    render(
      <Page
        initialSetup={{
          variant: 'giveaway',
          opponentId: 'fox',
          humanColor: 'white',
        }}
        initialPosition={fromBitPosition(parsePos('W:Wa1:Bc3'))}
        thinker={fast}
      />,
    )

    // a1-b2 is White's only move; Black's only reply is the capture that
    // leaves White with nothing, which is how поддавки is won.
    await user.click(square('a1'))
    await user.click(square('b2'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Победа белых' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('Шашек не осталось')).toBeInTheDocument()
  })
})

describe('GameScreen: уголки', () => {
  it('sets men on light squares and tells the persona which game it is', async () => {
    const user = userEvent.setup()
    const thinker = new ManualThinker()
    render(
      <Page
        initialSetup={{
          variant: 'corners',
          opponentId: 'fox',
          humanColor: 'white',
        }}
        thinker={thinker}
      />,
    )

    // Men stand on light squares here, which checkers never allows.
    expect(square('b1')).toHaveAccessibleName('b1, белая шашка')

    await user.click(square('c3'))
    await user.click(square('d3'))
    await waitFor(() => expect(thinker.requests).toHaveLength(1))

    const request = thinker.requests[0]!.request
    expect(request.variant).toBe('corners')
    expect(request.position).toBe(
      'B:Wa1,b1,c1,a2,b2,c2,a3,b3,d3:Bf6,g6,h6,f7,g7,h7,f8,g8,h8:1',
    )
  })

  it('plays a race out to a win against a persona', async () => {
    const user = userEvent.setup()
    render(
      <Page
        initialSetup={{
          variant: 'corners',
          opponentId: 'fox',
          humanColor: 'white',
        }}
        initialPosition={parseCorners(
          'W:Wf6,g6,h6,f7,g7,h7,g8,h8,e8:Bd4,d5,d6,e4,e5,e6,a1,b1,c1',
        )}
        thinker={fast}
      />,
    )

    // e8-f8 fills the target; Black's answer cannot fill its own.
    await user.click(square('e8'))
    await user.click(square('f8'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByRole('heading', { name: 'Победа белых' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('Все шашки в доме соперника'),
    ).toBeInTheDocument()
  })

  it('shows a jump chain in the move list with every landing square', async () => {
    const user = userEvent.setup()
    render(
      <Page
        initialSetup={{
          variant: 'corners',
          opponentId: 'friend',
          humanColor: 'both',
        }}
        initialPosition={parseCorners('W:Wa1:Ba2,a4,b5')}
        thinker={fast}
      />,
    )

    await user.click(square('a1'))
    await user.click(square('c5'))

    expect(
      movesPlayed().getByRole('button', { name: 'a1-a3-a5-c5' }),
    ).toBeInTheDocument()
  })

  it('counts the home deadline down and rings the men still at home', () => {
    render(
      <Page
        initialSetup={{
          variant: 'corners',
          opponentId: 'fox',
          humanColor: 'white',
        }}
        initialPosition={parseCorners('W:Wa1,b2,d4:Bd5:70')}
        thinker={fast}
      />,
    )
    expect(bubble()).toHaveTextContent(
      'Выведите шашки из дома: осталось 5 ходов',
    )
    expect(square('a1')).toHaveClass('board__square--overdue')
    expect(square('b2')).toHaveClass('board__square--overdue')
    expect(square('d4')).not.toHaveClass('board__square--overdue')
  })

  it('names and rings the man the blocking rule caught', async () => {
    const user = userEvent.setup()
    render(
      <Page
        initialSetup={{
          variant: 'corners',
          opponentId: 'friend',
          humanColor: 'both',
        }}
        initialPosition={parseCorners('B:Wa1,d4:Bd5,c7:79')}
        thinker={fast}
      />,
    )

    await user.click(square('d5'))
    await user.click(square('d3'))

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Шашка a1 осталась дома после сорокового хода'),
    ).toBeInTheDocument()
    expect(square('a1')).toHaveClass('board__square--overdue')
    expect(square('d4')).not.toHaveClass('board__square--overdue')
  })
})
