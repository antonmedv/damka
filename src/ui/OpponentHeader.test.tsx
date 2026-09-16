import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { opponentById } from '../opponents/opponents.ts'
import { OpponentHeader } from './OpponentHeader.tsx'

/** The visible speech bubble; the same words are in the live region. */
const bubble = () => document.querySelector('.opponent__bubble')

describe('OpponentHeader', () => {
  it('shows the opponent with an avatar and no visible turn line', () => {
    render(
      <OpponentHeader
        opponent={opponentById('fox')}
        humanColor="white"
        toMove="white"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Лиса' })).toBeInTheDocument()
    expect(screen.getByText('Хитрит и ставит ловушки')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Лиса' })).toBeInTheDocument()
    // Said for a reader, drawn nowhere: the board shows the turn in colour.
    expect(screen.getByRole('status')).toHaveTextContent('Ход белых · вы')
    expect(bubble()).toBeNull()
  })

  it('names the opponent when the turn is theirs', () => {
    render(
      <OpponentHeader
        opponent={opponentById('owl')}
        humanColor="white"
        toMove="black"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Ход чёрных · Сова')
  })

  it('says the opponent is thinking while its move is searched', () => {
    render(
      <OpponentHeader
        opponent={opponentById('fox')}
        humanColor="white"
        toMove="black"
        thinking={true}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ход чёрных · Лиса. Лиса думает…',
    )
  })

  it('leaves both sides nameless while two humans play', () => {
    render(
      <OpponentHeader
        opponent={opponentById('friend')}
        humanColor="both"
        toMove="black"
        thinking={true}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/^Ход чёрных$/)
  })
})

describe('OpponentHeader: result', () => {
  it('announces the result and reopens the screen behind it', async () => {
    const onShowResult = vi.fn()
    const user = userEvent.setup()
    render(
      <OpponentHeader
        opponent={opponentById('fox')}
        humanColor="white"
        toMove="black"
        status="whiteWins"
        banter={{ kind: 'result' }}
        onShowResult={onShowResult}
      />,
    )
    // The result is what the region says; the button is named for the
    // screen it opens, so a reader is not told the same thing twice.
    expect(screen.getByRole('status')).toHaveTextContent(/^Победа белых$/)
    expect(bubble()).toHaveTextContent('Победа белых')

    await user.click(screen.getByRole('button', { name: 'Итог партии' }))
    expect(onShowResult).toHaveBeenCalledTimes(1)
  })

  it('says when the game was won on the clock', () => {
    render(
      <OpponentHeader
        opponent={opponentById('fox')}
        humanColor="white"
        toMove="white"
        status="blackWins"
        onTime={true}
        banter={{ kind: 'result' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Победа чёрных по времени',
    )
  })

  it('reads the result as plain text when there is no screen to reopen', () => {
    render(
      <OpponentHeader
        opponent={opponentById('friend')}
        humanColor="both"
        toMove="white"
        status="draw"
        banter={{ kind: 'result' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/^Ничья$/)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('OpponentHeader: offers', () => {
  it('offers a draw and takes the answer', async () => {
    const onAccept = vi.fn()
    const onDecline = vi.fn()
    const user = userEvent.setup()
    render(
      <OpponentHeader
        opponent={opponentById('owl')}
        humanColor="white"
        toMove="white"
        banter={{ kind: 'offer', offer: 'draw' }}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Похоже, ничья. Соглашаемся?',
    )

    await user.click(
      screen.getByRole('button', { name: 'Согласиться на ничью' }),
    )
    await user.click(screen.getByRole('button', { name: 'Играем дальше' }))
    expect(onAccept).toHaveBeenCalledWith('draw')
    expect(onDecline).toHaveBeenCalledWith('draw')
  })

  it('offers the player the way out of a lost game', async () => {
    const onAccept = vi.fn()
    const user = userEvent.setup()
    render(
      <OpponentHeader
        opponent={opponentById('raven')}
        humanColor="black"
        toMove="black"
        banter={{ kind: 'offer', offer: 'resign' }}
        onAccept={onAccept}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Вам уже не спастись. Сдаётесь?',
    )

    await user.click(screen.getByRole('button', { name: 'Сдаться' }))
    expect(onAccept).toHaveBeenCalledWith('resign')
  })
})

describe('OpponentHeader: remarks', () => {
  it('comments on the move just played', () => {
    const { rerender } = render(
      <OpponentHeader
        opponent={opponentById('hare')}
        humanColor="white"
        toMove="white"
        banter={{ kind: 'remark', id: 'feast' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Вкусно!')
    expect(bubble()).toHaveTextContent('Вкусно!')

    rerender(
      <OpponentHeader
        opponent={opponentById('hare')}
        humanColor="white"
        toMove="white"
        banter={{ kind: 'remark', id: 'praise' }}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Хороший ход!')
  })
})

describe('OpponentHeader: actions', () => {
  it('shows no actions unless handlers are given', () => {
    render(
      <OpponentHeader
        opponent={opponentById('fox')}
        humanColor="white"
        toMove="white"
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers a new game', async () => {
    const onNewGame = vi.fn()
    const user = userEvent.setup()
    render(
      <OpponentHeader
        opponent={opponentById('friend')}
        humanColor="both"
        toMove="white"
        onNewGame={onNewGame}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Новая игра' }))
    expect(onNewGame).toHaveBeenCalledTimes(1)
  })

  it('leaves the board flip to the navbar', () => {
    render(
      <OpponentHeader
        opponent={opponentById('fox')}
        humanColor="white"
        toMove="white"
        onNewGame={() => {}}
      />,
    )
    expect(
      screen.queryByRole('button', { name: 'Перевернуть доску' }),
    ).toBeNull()
  })
})
