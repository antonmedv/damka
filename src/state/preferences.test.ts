import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultPrefs,
  loadPrefs,
  prefsFrom,
  resolveColor,
  savePrefs,
  setupFrom,
} from './preferences.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('preferences', () => {
  it('starts on the defaults when nothing was stored', () => {
    expect(loadPrefs()).toEqual(defaultPrefs)
  })

  it('remembers the last game that was set up', () => {
    savePrefs({
      variant: 'checkers',
      opponentId: 'owl',
      color: 'random',
      timeControlId: '10+5:1+0',
    })
    expect(loadPrefs()).toEqual({
      variant: 'checkers',
      opponentId: 'owl',
      color: 'random',
      timeControlId: '10+5:1+0',
    })
  })

  it('remembers which game was played', () => {
    savePrefs({
      variant: 'giveaway',
      opponentId: 'owl',
      color: 'white',
      timeControlId: 'none',
    })
    expect(loadPrefs().variant).toBe('giveaway')
    expect(setupFrom(loadPrefs()).variant).toBe('giveaway')
  })

  it('falls back to checkers for a game it does not know', () => {
    localStorage.setItem(
      'damka.newGame',
      JSON.stringify({ ...defaultPrefs, variant: 'chess' }),
    )
    expect(loadPrefs().variant).toBe('checkers')
  })

  it('drops a field it can no longer play, keeping the rest', () => {
    localStorage.setItem(
      'damka.newGame',
      JSON.stringify({
        variant: 'checkers',
        opponentId: 'dragon',
        color: 'black',
        timeControlId: '999+0',
      }),
    )
    expect(loadPrefs()).toEqual({
      variant: 'checkers',
      opponentId: defaultPrefs.opponentId,
      color: 'black',
      timeControlId: 'none',
    })
  })

  it('falls back on a store it cannot read', () => {
    localStorage.setItem('damka.newGame', 'not json')
    expect(loadPrefs()).toEqual(defaultPrefs)
    const broken = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    expect(loadPrefs()).toEqual(defaultPrefs)
    broken.mockRestore()
  })

  it('survives a store that refuses to be written to', () => {
    const broken = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    expect(() => savePrefs(defaultPrefs)).not.toThrow()
    broken.mockRestore()
  })

  it('turns preferences into a game, rolling a random colour', () => {
    const prefs = {
      variant: 'checkers',
      opponentId: 'owl',
      color: 'random',
      timeControlId: '3+2',
    } as const
    expect(setupFrom(prefs, () => 0.9)).toEqual({
      variant: 'checkers',
      opponentId: 'owl',
      humanColor: 'black',
      timeControlId: '3+2',
    })
    expect(setupFrom(prefs, () => 0.1).humanColor).toBe('white')
    expect(resolveColor('black', () => 0.9)).toBe('black')
  })

  it('hands both colours to the players sharing a device', () => {
    expect(
      setupFrom({
        variant: 'checkers',
        opponentId: 'friend',
        color: 'white',
        timeControlId: 'none',
      }).humanColor,
    ).toBe('both')
  })

  it('keeps the colour that was asked for, not the one it rolled', () => {
    expect(
      prefsFrom(
        {
          variant: 'checkers',
          opponentId: 'fox',
          humanColor: 'black',
          timeControlId: '3+2',
        },
        'random',
      ),
    ).toEqual({
      variant: 'checkers',
      opponentId: 'fox',
      color: 'random',
      timeControlId: '3+2',
    })
    expect(
      prefsFrom(
        { variant: 'checkers', opponentId: 'fox', humanColor: 'white' },
        'white',
      ).timeControlId,
    ).toBe('none')
  })
})
