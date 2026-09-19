import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSoundOn, setSoundOn } from '../sound/sound.ts'
import { NavBar } from './NavBar.tsx'

beforeEach(() => {
  setSoundOn(true)
})

describe('NavBar', () => {
  it('shows the brand as the page heading', () => {
    render(<NavBar />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Damka' }),
    ).toBeInTheDocument()
  })

  it('marks Шашки as the current game', () => {
    render(<NavBar />)
    const nav = screen.getByRole('navigation', { name: 'Игры' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Шашки' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('offers all three games, Уголки included', () => {
    render(<NavBar />)
    const tabs = screen.getAllByRole('link').map((tab) => tab.textContent)
    expect(tabs).toEqual(['Шашки', 'Поддавки', 'Уголки'])
    expect(screen.getByRole('link', { name: 'Уголки' })).toHaveAttribute(
      'href',
      expect.stringContaining('game=corners'),
    )
    expect(screen.queryByText('скоро')).toBeNull()
  })

  it('offers Поддавки as a game that can be played', () => {
    render(<NavBar />)
    const tab = screen.getByRole('link', { name: 'Поддавки' })
    expect(tab).not.toHaveAttribute('aria-current')
    // The href is worth copying even though the click never follows it.
    expect(tab).toHaveAttribute(
      'href',
      expect.stringContaining('game=giveaway'),
    )
  })

  it('marks the game being played, whichever it is', () => {
    render(<NavBar current="giveaway" />)
    expect(screen.getByRole('link', { name: 'Поддавки' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Шашки' })).not.toHaveAttribute(
      'aria-current',
    )
  })
})

describe('NavBar: choosing a game', () => {
  it('asks for the game whose tab was pressed', () => {
    const onSelect = vi.fn()
    render(<NavBar current="checkers" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('link', { name: 'Поддавки' }))

    expect(onSelect).toHaveBeenCalledWith('giveaway')
  })

  it('never navigates away, so the game in progress survives', () => {
    const onSelect = vi.fn()
    render(<NavBar current="checkers" onSelect={onSelect} />)
    const link = screen.getByRole('link', { name: 'Поддавки' })
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.click(link)).toBe(false)
  })

  it('does not ask again for the game already being played', () => {
    const onSelect = vi.fn()
    render(<NavBar current="giveaway" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('link', { name: 'Поддавки' }))

    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('NavBar: current tab', () => {
  it('does not navigate (and lose the game) when the current tab is clicked', () => {
    render(<NavBar />)
    const link = screen.getByRole('link', { name: 'Шашки' })
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.click(link)).toBe(false)
  })
})

describe('NavBar: board flip', () => {
  it('turns the board round for the screen below it', () => {
    const onFlip = vi.fn()
    render(<NavBar onFlip={onFlip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Перевернуть доску' }))

    expect(onFlip).toHaveBeenCalledTimes(1)
  })

  it('shows no flip button when there is no board to turn', () => {
    render(<NavBar />)
    expect(
      screen.queryByRole('button', { name: 'Перевернуть доску' }),
    ).toBeNull()
  })
})

describe('NavBar: sound', () => {
  it('starts on and turns the sound off when pressed', () => {
    render(<NavBar />)
    const button = screen.getByRole('button', { name: 'Выключить звук' })
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button)

    expect(
      screen.getByRole('button', { name: 'Включить звук' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(isSoundOn()).toBe(false)
  })

  it('turns the sound back on', () => {
    render(<NavBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Выключить звук' }))
    fireEvent.click(screen.getByRole('button', { name: 'Включить звук' }))

    expect(isSoundOn()).toBe(true)
  })
})
