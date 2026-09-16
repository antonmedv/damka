import { describe, expect, it } from 'vitest'
import { opponents } from './opponents.ts'
import { budgetFor, isPersonaId, personaIds, personas } from './personas.ts'

describe('personas', () => {
  it('exist for every computer opponent and nothing else', () => {
    for (const o of opponents) {
      expect(isPersonaId(o.id)).toBe(o.kind === 'computer')
    }
    expect(personaIds.every((id) => id in personas)).toBe(true)
  })

  it('get stronger and stricter from the kitten to the raven', () => {
    const { kitten, hare, fox, owl, raven } = personas
    expect(kitten.depth).toBeLessThan(hare.depth)
    expect(hare.depth).toBeLessThan(fox.depth)
    expect(fox.budgetMs).toBeLessThan(owl.budgetMs)
    expect(kitten.margin).toBeGreaterThan(hare.margin)
    expect(kitten.temperature).toBeGreaterThan(hare.temperature)
    expect(hare.margin).toBeGreaterThan(fox.margin)
    expect(fox.margin).toBeGreaterThan(owl.margin)
    expect(owl.margin).toBe(0)
    expect(owl.budgetMs).toBeLessThan(raven.budgetMs)
    expect(raven.margin).toBe(0)
  })
})

describe('budgetFor', () => {
  it('keeps the persona budget when there is time to spare', () => {
    const limits = budgetFor(personas.fox, 600_000, 5_000)
    expect(limits.budgetMs).toBe(personas.fox.budgetMs)
    expect(limits.minThinkMs).toBe(personas.fox.minThinkMs)
  })

  it('spends a fortieth of the bank plus most of the increment', () => {
    // Raven would like three seconds; a one-minute bank allows 1.5.
    expect(budgetFor(personas.raven, 60_000, 0).budgetMs).toBe(1_500)
    expect(budgetFor(personas.raven, 60_000, 2_000).budgetMs).toBe(3_000)
  })

  it('tapers as the bank empties', () => {
    const left = [60_000, 20_000, 5_000, 1_000].map(
      (ms) => budgetFor(personas.raven, ms, 0).budgetMs,
    )
    expect(left).toEqual([1_500, 500, 125, 25])
  })

  it('always leaves enough time to deliver the move', () => {
    expect(budgetFor(personas.raven, 300, 10_000).budgetMs).toBe(150)
  })

  it('never returns less than a usable budget', () => {
    expect(budgetFor(personas.raven, 0, 0).budgetMs).toBe(20)
    expect(budgetFor(personas.kitten, 100, 0).budgetMs).toBe(20)
  })

  it('never makes the persona wait longer than it thinks', () => {
    for (const persona of Object.values(personas)) {
      for (const ms of [600_000, 60_000, 5_000, 500, 0]) {
        const limits = budgetFor(persona, ms, 0)
        expect(limits.minThinkMs).toBeLessThanOrEqual(limits.budgetMs)
        expect(limits.minThinkMs).toBeLessThanOrEqual(persona.minThinkMs)
      }
    }
  })
})
