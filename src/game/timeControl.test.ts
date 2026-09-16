import { describe, expect, it, vi } from 'vitest'
import {
  formatDuration,
  incrementOf,
  isPreset,
  isSplit,
  isTimed,
  isValidTiming,
  minutesOf,
  NO_CLOCK,
  timeControlById,
  timeControlId,
  timeControlOf,
  timeControls,
  timing,
  timingFor,
} from './timeControl.ts'

describe('time controls', () => {
  it('lists the presets, untimed first', () => {
    expect(timeControls.map((c) => c.id)).toEqual(['none', '5+0', '10+5'])
  })

  it('holds the advertised banks and increments', () => {
    expect(timeControlById('none')).toEqual(NO_CLOCK)
    expect(timeControlById('5+0')).toEqual({
      id: '5+0',
      own: { initialMs: 300_000, incrementMs: 0 },
      opponent: { initialMs: 300_000, incrementMs: 0 },
    })
    expect(timeControlById('10+5').own).toEqual({
      initialMs: 600_000,
      incrementMs: 5_000,
    })
    // A timing the dialog does not offer is still playable by hand.
    expect(timeControlById('3+2').own).toEqual({
      initialMs: 180_000,
      incrementMs: 2_000,
    })
  })

  it('reads a control set by hand', () => {
    const control = timeControlById('2+1')
    expect(control.id).toBe('2+1')
    expect(control.own).toEqual({ initialMs: 120_000, incrementMs: 1_000 })
    expect(control.opponent).toEqual(control.own)
    expect(isSplit(control)).toBe(false)
    expect(timeControlId(timing(7, 3))).toBe('7+3')
    expect(isPreset('10+5')).toBe(true)
    expect(isPreset('3+2')).toBe(false)
    expect(minutesOf(timeControlById('7+3').own)).toBe(7)
    expect(incrementOf(timeControlById('7+3').own)).toBe(3)
  })

  it('gives the two sides different clocks when asked', () => {
    const split = timeControlById('10+5:1+0')
    expect(isSplit(split)).toBe(true)
    expect(split.own).toEqual({ initialMs: 600_000, incrementMs: 5_000 })
    expect(split.opponent).toEqual({ initialMs: 60_000, incrementMs: 0 })
    expect(timeControlId(timing(10, 5), timing(1, 0))).toBe('10+5:1+0')
    // Two equal halves are the same control as one; the id says so.
    expect(timeControlId(timing(3, 2), timing(3, 2))).toBe('3+2')
    expect(timeControlById('3+2:3+2').id).toBe('3+2')
  })

  it('hands each colour the clock it plays on', () => {
    const split = timeControlById('10+5:1+0')
    expect(timingFor(split, 'black', 'black')).toEqual(split.own)
    expect(timingFor(split, 'white', 'black')).toEqual(split.opponent)
    // Nobody to call the opponent: white takes the first half.
    expect(timingFor(split, 'white', 'both')).toEqual(split.own)
    expect(timingFor(split, 'black', 'both')).toEqual(split.opponent)
  })

  it('throws on an id nobody may play', () => {
    expect(() => timeControlById('')).toThrow('unknown time control: ')
    expect(() => timeControlById('3+')).toThrow('unknown time control: 3+')
    expect(() => timeControlById('0+0')).toThrow('unknown time control: 0+0')
    expect(() => timeControlById('181+0')).toThrow(
      'unknown time control: 181+0',
    )
    expect(() => timeControlById('3+181')).toThrow(
      'unknown time control: 3+181',
    )
    expect(() => timeControlById('3+2:0+0')).toThrow(
      'unknown time control: 3+2:0+0',
    )
    expect(() => timeControlById('1+0:2+0:3+0')).toThrow(
      'unknown time control: 1+0:2+0:3+0',
    )
    expect(() => timing(0, 0)).toThrow('bad timing: 0+0')
    expect(isValidTiming(1.5, 0)).toBe(false)
  })

  it('plays on untimed when an id cannot be honoured', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(timeControlOf(undefined)).toEqual(NO_CLOCK)
    expect(timeControlOf('1000+0')).toEqual(NO_CLOCK)
    expect(logged).toHaveBeenCalledOnce()
    expect(timeControlOf('5+0').id).toBe('5+0')
    logged.mockRestore()
  })

  it('counts only a non-empty bank as timed', () => {
    expect(isTimed(NO_CLOCK)).toBe(false)
    // Either side having a bank puts the game on the clock.
    expect(
      isTimed({ id: '5+0', own: NO_CLOCK.own, opponent: timing(5, 0) }),
    ).toBe(true)
    expect(timeControls.filter(isTimed).map((c) => c.id)).toEqual([
      '5+0',
      '10+5',
    ])
  })
})

describe('formatDuration', () => {
  it('keeps m:ss all the way down', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(2100)).toBe('0:03')
    expect(formatDuration(65_000)).toBe('1:05')
  })

  it('shows any time at all as a second', () => {
    expect(formatDuration(120)).toBe('0:01')
  })
})
