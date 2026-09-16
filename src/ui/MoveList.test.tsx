import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { squareFromName } from '../game/board.ts'
import type { Move } from '../game/types.ts'
import { MoveList } from './MoveList.tsx'

const quiet = (from: string, to: string): Move => ({
  from: squareFromName(from),
  to: squareFromName(to),
  captures: [],
  promotes: false,
  path: [squareFromName(to)],
})
const moves = [quiet('c3', 'd4'), quiet('f6', 'e5'), quiet('e3', 'f4')]

describe('MoveList', () => {
  it('shows an empty state before any move', () => {
    render(<MoveList moves={[]} current={-1} onSelect={() => {}} />)
    expect(screen.getByText('Ходов пока нет')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('lists numbered pairs in notation', () => {
    render(<MoveList moves={moves} current={2} onSelect={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('1.c3-d4f6-e5')
    expect(items[1]).toHaveTextContent('2.e3-f4')
  })

  it('marks the move that produced the current position', () => {
    render(<MoveList moves={moves} current={1} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'f6-e5' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('button', { name: 'e3-f4' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('reports the index of a clicked move', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<MoveList moves={moves} current={2} onSelect={onSelect} />)

    await user.click(screen.getByRole('button', { name: 'f6-e5' }))
    expect(onSelect).toHaveBeenCalledWith(1)
  })
})

describe('MoveList: keeping the current move in view', () => {
  it('scrolls only the list, never the page', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<MoveList moves={moves} current={2} onSelect={() => {}} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
