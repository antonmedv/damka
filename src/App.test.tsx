import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Damka' })).toBeInTheDocument()
  })

  it('credits the author', () => {
    render(<App />)
    expect(
      screen.getByText('Программа разработана Антоном Медведевым'),
    ).toBeInTheDocument()
  })
})
