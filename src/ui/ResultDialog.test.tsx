import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { parseCorners } from '../corners/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { squareFromName } from '../game/board.ts'
import { gameReducer, initialState } from '../state/gameReducer.ts'
import type { GameSetup, GameState } from '../state/gameReducer.ts'
import { ResultDialog } from './ResultDialog.tsx'

const sq = squareFromName

const hotSeat: GameSetup = {
  variant: 'checkers',
  opponentId: 'friend',
  humanColor: 'both',
}

function stateAt(literal: string, setup: GameSetup = hotSeat): GameState {
  return initialState(setup, fromBitPosition(parsePos(literal)), 0)
}

function play(
  state: GameState,
  ...moves: [from: string, to: string, at?: number][]
): GameState {
  return moves.reduce(
    (s, [from, to, at]) =>
      gameReducer(s, { type: 'move', from: sq(from), to: sq(to), at }),
    state,
  )
}

/**
 * White takes the last black man and wins on the board. The move is played
 * between two humans and the setup put on afterwards, so the screen can be
 * shown a game the player lost without the reducer refusing the move.
 */
function won(setup: GameSetup = hotSeat): GameState {
  return { ...play(stateAt('W:Wc3:Bd4'), ['c3', 'e5']), setup }
}

function show(state: GameState, props = {}) {
  return render(
    <ResultDialog
      open={true}
      state={state}
      onClose={() => {}}
      onNewGame={() => {}}
      {...props}
    />,
  )
}

function row(label: string): string[] {
  const cells = within(screen.getByRole('row', { name: new RegExp(label) }))
  return cells.getAllByRole('cell').map((cell) => cell.textContent ?? '')
}

describe('ResultDialog', () => {
  it('says how the game ended', () => {
    show(won())
    expect(
      screen.getByRole('heading', { name: 'Победа белых' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Шашек не осталось')).toBeInTheDocument()
  })

  it('says a side had nothing to move when it still had pieces', () => {
    // Black's man on a1 is hemmed in by its own edge and White's man.
    show(play(stateAt('W:Wc3:Ba1'), ['c3', 'd4']))
    expect(screen.getByText('Ходить нечем')).toBeInTheDocument()
  })

  it('says why the winner won at поддавки, not why the loser lost', () => {
    const giveaway: GameSetup = { ...hotSeat, variant: 'giveaway' }
    // White's only move is a1-b2, Black must take it, and White is then
    // out of pieces — which is the поддавки win. The reason has to be
    // read off the winner there, or it would report the loser's full
    // board as "nothing to move with".
    show({
      ...play(stateAt('W:Wa1:Bc3'), ['a1', 'b2'], ['c3', 'a1']),
      setup: giveaway,
    })
    expect(
      screen.getByRole('heading', { name: 'Победа белых' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Шашек не осталось')).toBeInTheDocument()
  })

  it('names the result in the player own terms', () => {
    show(won({ variant: 'checkers', opponentId: 'fox', humanColor: 'white' }))
    expect(screen.getByText('Вы выиграли')).toBeInTheDocument()
  })

  it('names the opponent when the player lost', () => {
    show(won({ variant: 'checkers', opponentId: 'fox', humanColor: 'black' }))
    expect(screen.getByText('Выигрывает Лиса')).toBeInTheDocument()
  })

  it('says nothing personal in a game for two', () => {
    show(won())
    expect(screen.queryByText('Вы выиграли')).not.toBeInTheDocument()
  })

  it('reports a loss on time as one', () => {
    const timed = stateAt('W:Wc3:Bd6,f6', {
      ...hotSeat,
      timeControlId: '3+2',
    })
    const flagged = gameReducer(timed, {
      type: 'flag',
      color: 'white',
      at: 200_000,
    })
    show(flagged)
    expect(
      screen.getByRole('heading', { name: 'Победа чёрных по времени' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Время вышло')).toBeInTheDocument()
  })

  it('counts the game up side by side', () => {
    show(won())
    expect(row('Ходов')).toEqual(['1', '0'])
    expect(row('Взято шашек')).toEqual(['1', '0'])
    expect(row('Крупнейшее взятие')).toEqual(['1 шашка', '—'])
  })

  it('adds what each side spent when there was a clock', () => {
    const timed = stateAt('W:Wc3:Bd4', {
      ...hotSeat,
      timeControlId: '5+0',
    })
    show(play(timed, ['c3', 'e5', 7000]))
    expect(row('Время на ходы')).toEqual(['0:07', '0:00'])
    expect(row('Самый долгий ход')).toEqual(['0:07', '0:00'])
  })

  it('leaves the clock rows out of an untimed game', () => {
    show(won())
    expect(screen.queryByText('Время на ходы')).not.toBeInTheDocument()
  })

  it('puts the player own column first', () => {
    show(won({ variant: 'checkers', opponentId: 'fox', humanColor: 'black' }))
    const table = screen.getByRole('table', { name: 'Партия в числах' })
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
    expect(heads).toEqual(['Вы', 'Лиса'])
    // Black played no move, so the player's own column is the empty one.
    expect(row('Ходов')).toEqual(['0', '1'])
  })

  it('graphs the material and reads out its last point', () => {
    show(won())
    expect(
      screen.getByRole('img', { name: /Перевес в материале/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('+1 у белых')).toBeInTheDocument()
    expect(screen.getByText('после 1-го хода')).toBeInTheDocument()
  })

  it('walks the graph with the arrow keys', async () => {
    const user = userEvent.setup()
    show(won())
    screen.getByRole('img', { name: /Перевес в материале/ }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('Материал равный')).toBeInTheDocument()
    expect(screen.getByText('начало партии')).toBeInTheDocument()
  })

  it('keeps every plotted value in a table', () => {
    show(won())
    const table = screen.getByRole('table', {
      name: 'Материал после каждого полухода',
    })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    // The box that hides it has to be the wrapper: a table keeps the size
    // of its rows however small the box is told to be, and a long game
    // would leave that height behind as dead scroll in the dialog.
    expect(table).not.toHaveClass('chart__table')
    expect(table.parentElement).toHaveClass('chart__table')
  })

  it('offers a new game and a way back to the board', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onNewGame = vi.fn()
    show(won(), { onClose, onNewGame })
    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    await user.click(screen.getByRole('button', { name: 'Новая игра' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onNewGame).toHaveBeenCalledOnce()
  })

  it('renders nothing while it is closed', () => {
    render(
      <ResultDialog
        open={false}
        state={won()}
        onClose={() => {}}
        onNewGame={() => {}}
      />,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('ResultDialog: уголки', () => {
  const race: GameSetup = {
    variant: 'corners',
    opponentId: 'friend',
    humanColor: 'both',
  }

  function raceAt(literal: string): GameState {
    return initialState(race, parseCorners(literal), 0)
  }

  it('says the target was filled and counts jumps rather than captures', () => {
    const state = play(
      raceAt('W:Wf6,g6,h6,f7,g7,h7,g8,h8,e8:Bd4,d5,d6,e4,e5,e6,a1,b1,c1'),
      ['e8', 'f8'],
      ['d4', 'd3'],
    )
    show(state)
    expect(
      screen.getByRole('heading', { name: 'Победа белых' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Все шашки в доме соперника')).toBeInTheDocument()
    expect(row('Ходов с прыжками')).toEqual(['0', '0'])
    expect(row('Самая длинная цепочка')).toEqual(['—', '—'])
    expect(screen.queryByText('Взято шашек')).toBeNull()
    expect(screen.getByText('Перевес в гонке')).toBeInTheDocument()
  })

  it('names a draw where both filled their targets on one move', () => {
    const state = play(
      raceAt('W:Wf6,g6,h6,f7,g7,h7,g8,h8,e8:Ba1,b1,c1,a2,b2,c2,a3,b3,d3'),
      ['e8', 'f8'],
      ['d3', 'c3'],
    )
    show(state)
    expect(screen.getByRole('heading', { name: 'Ничья' })).toBeInTheDocument()
    expect(
      screen.getByText('Оба заняли дом соперника на одном ходу'),
    ).toBeInTheDocument()
  })

  it('names the man the blocking rule caught and shows the chain length', () => {
    const state = play(raceAt('B:Wa1,d4:Bd5,c7:79'), ['d5', 'd3'])
    show(state)
    expect(
      screen.getByRole('heading', { name: 'Победа чёрных' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Шашка a1 осталась дома после сорокового хода'),
    ).toBeInTheDocument()
    expect(row('Самая длинная цепочка')).toEqual(['—', '1 прыжок'])
  })

  it('lists every man the blocking rule caught', () => {
    show(play(raceAt('B:Wa1,b2,c3,d4:Bd5,c7:79'), ['d5', 'd3']))
    expect(
      screen.getByText('Шашки a1, b2 и c3 остались дома после сорокового хода'),
    ).toBeInTheDocument()
  })

  it('declines the squares left for the table and for the reading', () => {
    // Black finishes with d3-c3; White has 21 squares left to walk.
    const state = play(
      raceAt('B:Wc4,c5,c6,d4,d5,d6,f8,g8,h8:Ba1,b1,c1,a2,b2,c2,a3,b3,d3'),
      ['d3', 'c3'],
    )
    show(state)
    expect(screen.getByText('Чёрные впереди на 21 клетку')).toBeInTheDocument()
    const table = screen.getByRole('table', {
      name: 'Осталось пройти после каждого полухода',
    })
    expect(within(table).getAllByText('21 клетка')).toHaveLength(2)
    expect(within(table).getByText('1 клетка')).toBeInTheDocument()
    expect(within(table).getByText('0 клеток')).toBeInTheDocument()
  })

  it('names nobody when the rule caught both sides', () => {
    show(play(raceAt('B:Wa1,d4:Bd5,h8:79'), ['d5', 'd3']))
    expect(screen.getByRole('heading', { name: 'Ничья' })).toBeInTheDocument()
    expect(
      screen.getByText('У обоих шашки остались дома после сорокового хода'),
    ).toBeInTheDocument()
  })
})
