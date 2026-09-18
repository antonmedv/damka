import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DirectThinker } from '../opponents/direct.ts'
import { defaultSetup } from '../state/gameReducer.ts'
import { Page } from './Page.tsx'

/** The screen below needs a thinker; nothing here waits for a reply. */
function show(variant: 'checkers' | 'giveaway' = 'checkers') {
  render(
    <Page
      initialSetup={{ ...defaultSetup, variant, humanColor: 'both' }}
      thinker={new DirectThinker()}
      endgameDb={false}
    />,
  )
}

function tab(name: string): HTMLElement {
  return screen.getByRole('link', { name })
}

describe('Page: choosing a game from the navbar', () => {
  it('marks the game on the board', () => {
    show('giveaway')
    expect(tab('Поддавки')).toHaveAttribute('aria-current', 'page')
    expect(tab('Шашки')).not.toHaveAttribute('aria-current')
  })

  it('opens the new game dialog rather than switching underneath', async () => {
    const user = userEvent.setup()
    show('checkers')

    await user.click(tab('Поддавки'))

    expect(screen.getByRole('dialog', { name: 'Новая игра' })).toBeVisible()
    // Nothing has changed yet: the game on the board is still checkers.
    expect(tab('Шашки')).toHaveAttribute('aria-current', 'page')
  })

  it('leaves the game alone when the dialog is cancelled', async () => {
    const user = userEvent.setup()
    show('checkers')

    await user.click(tab('Поддавки'))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(tab('Шашки')).toHaveAttribute('aria-current', 'page')
    expect(tab('Поддавки')).not.toHaveAttribute('aria-current')
  })

  it('switches the game once one is actually started', async () => {
    const user = userEvent.setup()
    show('checkers')

    await user.click(tab('Поддавки'))
    await user.click(screen.getByRole('button', { name: 'Начать' }))

    expect(tab('Поддавки')).toHaveAttribute('aria-current', 'page')
    expect(tab('Шашки')).not.toHaveAttribute('aria-current')
  })
})
