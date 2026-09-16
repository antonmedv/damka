import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GameSetup } from '../state/gameReducer.ts'
import { NewGameDialog } from './NewGameDialog.tsx'

function renderDialog(
  rng = () => 0.1,
  initial: GameSetup = { opponentId: 'hare', humanColor: 'white' },
) {
  const onStart = vi.fn()
  const onCancel = vi.fn()
  render(
    <NewGameDialog
      open={true}
      initial={initial}
      onStart={onStart}
      onCancel={onCancel}
      rng={rng}
    />,
  )
  return { onStart, onCancel, user: userEvent.setup() }
}

/** Types a number into a spin button that already holds one. */
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const field = screen.getByRole('spinbutton', { name: label })
  await user.clear(field)
  await user.type(field, value)
}

describe('NewGameDialog', () => {
  it('lists every opponent and preselects the current one', () => {
    renderDialog()
    expect(
      screen.getByRole('dialog', { name: 'Новая игра' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Заяц/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Лиса/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Сова/ })).toBeInTheDocument()
    expect(
      screen.getByRole('radio', { name: /Друг рядом/ }),
    ).toBeInTheDocument()
  })

  it('says how strong each computer opponent is', () => {
    renderDialog()
    expect(screen.getByRole('radio', { name: /Котёнок/ })).toHaveAccessibleName(
      /Сила 1 из 5/,
    )
    expect(screen.getByRole('radio', { name: /Ворон/ })).toHaveAccessibleName(
      /Сила 5 из 5/,
    )
    // A friend at the same table has no strength to show.
    expect(
      screen.getByRole('radio', { name: /Друг рядом/ }),
    ).toHaveAccessibleName(/^(?!.*Сила).*$/)
  })

  it('starts a game with the chosen opponent and colour', async () => {
    const { onStart, user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Сова/ }))
    await user.click(screen.getByRole('radio', { name: 'Чёрные' }))
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'owl', humanColor: 'black', timeControlId: 'none' },
      'black',
    )
  })

  it('resolves a random colour but reports the choice as random', async () => {
    const { onStart, user } = renderDialog(() => 0.9)
    await user.click(screen.getByRole('radio', { name: 'Случайно' }))
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'hare', humanColor: 'black', timeControlId: 'none' },
      'random',
    )
  })

  it('hides the colour choice for two humans and starts with both', async () => {
    const { onStart, user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Друг рядом/ }))
    expect(screen.queryByRole('radio', { name: 'Белые' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'friend', humanColor: 'both', timeControlId: 'none' },
      'white',
    )
  })

  it('spells out what each time control means', async () => {
    const { onStart, user } = renderDialog()
    expect(
      screen.getByRole('radio', { name: 'Без часов Играем не спеша' }),
    ).toBeChecked()
    for (const label of [
      '5 мин на партию Без добавки',
      '10 мин на партию +5 сек за ход',
    ]) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
    await user.click(
      screen.getByRole('radio', { name: '5 мин на партию Без добавки' }),
    )
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'hare', humanColor: 'white', timeControlId: '5+0' },
      'white',
    )
  })

  it('preselects the time control of the current game', () => {
    renderDialog(undefined, {
      opponentId: 'hare',
      humanColor: 'white',
      timeControlId: '10+5',
    })
    expect(
      screen.getByRole('radio', { name: '10 мин на партию +5 сек за ход' }),
    ).toBeChecked()
  })

  it('takes a time control of the player own making', async () => {
    const { onStart, user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Свои/ }))
    await fill(user, 'Минут на партию', '7')
    await fill(user, 'Секунд за ход', '3')
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'hare', humanColor: 'white', timeControlId: '7+3' },
      'white',
    )
  })

  it('gives the opponent a clock of its own', async () => {
    const { onStart, user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Свои/ }))
    await fill(user, 'Минут на партию', '10')
    await fill(user, 'Секунд за ход', '5')
    await user.click(
      screen.getByRole('checkbox', { name: 'Сопернику другое время' }),
    )
    await fill(user, 'Минут сопернику', '1')
    await fill(user, 'Секунд за ход сопернику', '0')
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'hare', humanColor: 'white', timeControlId: '10+5:1+0' },
      'white',
    )
  })

  it('names the two clocks by colour when both players are here', async () => {
    const { user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Друг рядом/ }))
    await user.click(screen.getByRole('radio', { name: /Свои/ }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Сопернику другое время' }),
    )
    expect(
      screen.getByRole('spinbutton', { name: 'Минут белым' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Минут чёрным' }),
    ).toBeInTheDocument()
  })

  it('refuses to start on a time nobody can play', async () => {
    const { onStart, user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Свои/ }))
    await fill(user, 'Минут на партию', '0')
    const start = screen.getByRole('button', { name: 'Начать' })
    expect(start).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('от 1 до 180')
    await user.click(start)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('opens the own fields on a control it does not offer', () => {
    renderDialog(undefined, {
      opponentId: 'hare',
      humanColor: 'white',
      timeControlId: '3+2',
    })
    expect(screen.getByRole('radio', { name: /Свои/ })).toBeChecked()
    expect(
      screen.getByRole('spinbutton', { name: 'Минут на партию' }),
    ).toHaveValue(3)
  })

  it('opens on a hand-made control, split clocks and all', () => {
    renderDialog(undefined, {
      opponentId: 'hare',
      humanColor: 'white',
      timeControlId: '20+0:2+1',
    })
    expect(screen.getByRole('radio', { name: /Свои/ })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Сопернику другое время' }),
    ).toBeChecked()
    expect(screen.getByRole('spinbutton', { name: 'Минут вам' })).toHaveValue(
      20,
    )
    expect(
      screen.getByRole('spinbutton', { name: 'Минут сопернику' }),
    ).toHaveValue(2)
  })

  it('falls back to the untimed game on a control it cannot play', async () => {
    const { onStart, user } = renderDialog(undefined, {
      opponentId: 'hare',
      humanColor: 'white',
      timeControlId: '1000+0',
    })
    expect(
      screen.getByRole('radio', { name: 'Без часов Играем не спеша' }),
    ).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Начать' }))
    expect(onStart).toHaveBeenCalledWith(
      { opponentId: 'hare', humanColor: 'white', timeControlId: 'none' },
      'white',
    )
  })

  it('marks the field that is wrong, not the one beside it', async () => {
    const { user } = renderDialog()
    await user.click(screen.getByRole('radio', { name: /Свои/ }))
    await fill(user, 'Минут на партию', '0')
    expect(
      screen.getByRole('spinbutton', { name: 'Минут на партию' }),
    ).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByRole('spinbutton', { name: 'Секунд за ход' }),
    ).toHaveAttribute('aria-invalid', 'false')
  })

  it('cancels without starting', async () => {
    const { onStart, onCancel, user } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })
})
