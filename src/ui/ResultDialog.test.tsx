import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
