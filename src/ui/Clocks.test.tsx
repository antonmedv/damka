import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatClock, timeControlById } from '../game/timeControl.ts'
import type { Color } from '../game/types.ts'
import type { ClockView } from '../state/gameReducer.ts'
import { Clocks } from './Clocks.tsx'

function view(
  white: number,
  black: number,
  running: Color | null = 'white',
  flagged: Color | null = null,
): ClockView {
  const control = timeControlById('3+2')
  return {
    control,
    timings: { white: control.own, black: control.opponent },
    remaining: { white, black },
    running,
    flagged,
  }
}

/** The row whose label is `label`, as the element carrying the classes. */
function row(label: string): HTMLElement {
  const found = screen.getByText(label).parentElement
  if (found === null) throw new Error(`no row for ${label}`)
  return found
}

describe('formatClock', () => {
  it('counts minutes down to twenty seconds', () => {
    expect(formatClock(180_000)).toBe('3:00')
    expect(formatClock(600_000)).toBe('10:00')
    expect(formatClock(65_400)).toBe('1:06')
    expect(formatClock(20_000)).toBe('0:20')
  })

  it('switches to tenths below twenty seconds', () => {
    expect(formatClock(19_999)).toBe('20.0')
    expect(formatClock(9_900)).toBe('9.9')
    expect(formatClock(1_000)).toBe('1.0')
  })

  it('keeps a tenth on the board while a tenth is left', () => {
    expect(formatClock(99)).toBe('0.1')
    expect(formatClock(1)).toBe('0.1')
    expect(formatClock(0)).toBe('0.0')
    expect(formatClock(-500)).toBe('0.0')
  })
})

describe('Clocks', () => {
  it('renders nothing in an untimed game', () => {
    const { container } = render(
      <Clocks view={null} orientation="white" humanColor="white" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the sides by owner against a persona', () => {
    render(
      <Clocks
        view={view(180_000, 180_000)}
        orientation="white"
        humanColor="white"
      />,
    )
    expect(screen.getByText('Ваше время')).toBeInTheDocument()
    expect(screen.getByText('Время соперника')).toBeInTheDocument()
  })

  it('names the sides by colour in a hot-seat game', () => {
    render(
      <Clocks
        view={view(180_000, 180_000)}
        orientation="white"
        humanColor="both"
      />,
    )
    expect(screen.getByText('Время белых')).toBeInTheDocument()
    expect(screen.getByText('Время чёрных')).toBeInTheDocument()
  })

  it('puts the side at the bottom of the board last', () => {
    render(
      <Clocks
        view={view(180_000, 180_000)}
        orientation="black"
        humanColor="both"
      />,
    )
    const labels = screen
      .getAllByText(/Время (белых|чёрных)/)
      .map((node) => node.textContent)
    expect(labels).toEqual(['Время белых', 'Время чёрных'])
  })

  it('marks the running side and warns under ten seconds', () => {
    render(
      <Clocks
        view={view(9_400, 60_000)}
        orientation="white"
        humanColor="both"
      />,
    )
    const white = row('Время белых')
    expect(white).toHaveClass('clocks__row--running')
    expect(white).toHaveClass('clocks__row--low')
    expect(white).toHaveTextContent('9.4')
    expect(row('Время чёрных')).not.toHaveClass('clocks__row--running')
  })

  it('marks the side that ran out', () => {
    render(
      <Clocks
        view={view(0, 60_000, null, 'white')}
        orientation="white"
        humanColor="both"
      />,
    )
    expect(row('Время белых')).toHaveClass('clocks__row--flagged')
    expect(screen.getByRole('status')).toHaveTextContent('Время вышло')
  })

  it('keeps the digits away from screen readers', () => {
    render(
      <Clocks
        view={view(180_000, 180_000)}
        orientation="white"
        humanColor="both"
      />,
    )
    const digits = screen.getAllByText('3:00')
    expect(digits).toHaveLength(2)
    for (const node of digits) {
      expect(node).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('announces thirty seconds, then ten, and only once each', () => {
    const { rerender } = render(
      <Clocks
        view={view(60_000, 180_000)}
        orientation="white"
        humanColor="white"
      />,
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('')

    rerender(
      <Clocks
        view={view(29_000, 180_000)}
        orientation="white"
        humanColor="white"
      />,
    )
    expect(status).toHaveTextContent('Осталось 30 секунд')

    rerender(
      <Clocks
        view={view(28_000, 180_000)}
        orientation="white"
        humanColor="white"
      />,
    )
    expect(status).toHaveTextContent('Осталось 30 секунд')

    rerender(
      <Clocks
        view={view(9_000, 180_000)}
        orientation="white"
        humanColor="white"
      />,
    )
    expect(status).toHaveTextContent('Осталось 10 секунд')
  })

  it('says nothing about the opponent running low', () => {
    const { rerender } = render(
      <Clocks
        view={view(180_000, 60_000, 'black')}
        orientation="white"
        humanColor="white"
      />,
    )
    rerender(
      <Clocks
        view={view(180_000, 5_000, 'black')}
        orientation="white"
        humanColor="white"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
