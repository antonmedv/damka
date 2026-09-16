import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Controls } from './Controls.tsx'

function renderControls(props: Partial<Parameters<typeof Controls>[0]> = {}) {
  const onUndo = vi.fn()
  const onRedo = vi.fn()
  render(
    <Controls
      canUndo={true}
      canRedo={true}
      onUndo={onUndo}
      onRedo={onRedo}
      {...props}
    />,
  )
  return { onUndo, onRedo, user: userEvent.setup() }
}

describe('Controls', () => {
  it('disables undo and redo when there is nothing to do', () => {
    renderControls({ canUndo: false, canRedo: false })
    expect(screen.getByRole('button', { name: 'Отменить ход' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Вернуть ход' })).toBeDisabled()
  })

  it('calls the handlers from the buttons', async () => {
    const { onUndo, onRedo, user } = renderControls()
    await user.click(screen.getByRole('button', { name: 'Отменить ход' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть ход' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('undoes with Ctrl+Z or Cmd+Z and redoes with Shift added', async () => {
    const { onUndo, onRedo, user } = renderControls()
    await user.keyboard('{Control>}z{/Control}')
    await user.keyboard('{Meta>}z{/Meta}')
    expect(onUndo).toHaveBeenCalledTimes(2)
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('ignores shortcuts when nothing can be undone', async () => {
    const { onUndo, user } = renderControls({ canUndo: false })
    await user.keyboard('{Control>}z{/Control}')
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('ignores shortcuts while typing in a text field', async () => {
    const { onUndo, user } = renderControls()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    await user.keyboard('{Control>}z{/Control}')
    expect(onUndo).not.toHaveBeenCalled()
    input.remove()
  })
})

describe('Controls: reviewing', () => {
  it('labels the move list until an earlier position is shown', () => {
    renderControls()
    expect(screen.getByText('Ходы')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'К текущей позиции' }),
    ).toBeNull()
  })

  it('swaps the label for the way back to the latest position', async () => {
    const onToLive = vi.fn()
    const { user } = renderControls({ reviewing: true, onToLive })
    expect(screen.queryByText('Ходы')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'К текущей позиции' }))
    expect(onToLive).toHaveBeenCalledTimes(1)
  })
})

describe('Controls: keyboard layout', () => {
  it('undoes with Ctrl+Z on a Russian layout, where the key reads "я"', () => {
    const { onUndo } = renderControls()
    fireEvent.keyDown(window, { key: 'я', code: 'KeyZ', ctrlKey: true })
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('redoes with Ctrl+Shift+Z on a Russian layout', () => {
    const { onRedo } = renderControls()
    fireEvent.keyDown(window, {
      key: 'Я',
      code: 'KeyZ',
      ctrlKey: true,
      shiftKey: true,
    })
    expect(onRedo).toHaveBeenCalledTimes(1)
  })
})
