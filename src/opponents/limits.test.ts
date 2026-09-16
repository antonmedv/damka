import { describe, expect, it } from 'vitest'
import { cappedMs } from './limits.ts'

describe('cappedMs', () => {
  it('keeps our limit when the caller names none', () => {
    expect(cappedMs(500, undefined)).toBe(500)
  })

  it('takes whichever limit is shorter', () => {
    expect(cappedMs(500, 120)).toBe(120)
    expect(cappedMs(100, 3_000)).toBe(100)
  })
})
