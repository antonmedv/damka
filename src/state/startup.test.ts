import { describe, expect, it, vi } from 'vitest'
import { pieceAt, squareFromName } from '../game/board.ts'
import { defaultSetup } from './gameReducer.ts'
import { defaultPrefs } from './preferences.ts'
import { defaultStart, startFromQuery } from './startup.ts'

const sq = squareFromName

/** Every default game: the fox, human white, no clock. */
const untimedDefault = { ...defaultSetup, timeControlId: 'none' }

describe('startFromQuery', () => {
  it('starts a normal game when nothing is asked for', () => {
    expect(startFromQuery('')).toEqual(defaultStart)
    expect(startFromQuery('?theme=dark')).toEqual(defaultStart)
    expect(defaultStart).toEqual({
      setup: untimedDefault,
      position: null,
      colorChoice: 'white',
    })
  })

  it('starts on the game that was set up last', () => {
    const start = startFromQuery('', {
      opponentId: 'owl',
      color: 'black',
      timeControlId: '7+3',
    })
    expect(start).toEqual({
      setup: {
        opponentId: 'owl',
        humanColor: 'black',
        timeControlId: '7+3',
      },
      position: null,
      colorChoice: 'black',
    })
  })

  it('rolls a remembered random colour and keeps offering it', () => {
    const prefs = { ...defaultPrefs, color: 'random' } as const
    expect(startFromQuery('', prefs, () => 0.9).setup.humanColor).toBe('black')
    const start = startFromQuery('', prefs, () => 0.1)
    expect(start.setup.humanColor).toBe('white')
    expect(start.colorChoice).toBe('random')
  })

  it('reads a position literal and hands the board to two players', () => {
    const start = startFromQuery('?pos=W:Wd2:Bc3,e3,c5,e5,Kg3')
    expect(start.setup).toEqual({
      ...untimedDefault,
      opponentId: 'friend',
      humanColor: 'both',
    })
    const board = start.position?.board
    expect(start.position?.toMove).toBe('white')
    expect(pieceAt(board!, sq('d2'))).toEqual({ color: 'white', kind: 'man' })
    expect(pieceAt(board!, sq('g3'))).toEqual({ color: 'black', kind: 'king' })
    expect(pieceAt(board!, sq('a1'))).toBeUndefined()
  })

  it('takes the opponent and the human colour when they are given', () => {
    expect(startFromQuery('?pos=B:Wc3:Bd4&vs=owl&side=black').setup).toEqual({
      ...untimedDefault,
      opponentId: 'owl',
      humanColor: 'black',
    })
    expect(startFromQuery('?vs=raven').setup).toEqual({
      ...untimedDefault,
      opponentId: 'raven',
    })
    expect(startFromQuery('?side=both').setup).toEqual({
      ...untimedDefault,
      humanColor: 'both',
    })
  })

  it('never puts a position from the query on a clock', () => {
    const prefs = { ...defaultPrefs, timeControlId: '3+2' } as const
    expect(startFromQuery('?pos=W:Wc3:Bd4', prefs).setup.timeControlId).toBe(
      'none',
    )
    // Without a position the remembered clock stands.
    expect(startFromQuery('?vs=owl', prefs).setup.timeControlId).toBe('3+2')
  })

  it('takes the query colour over the remembered one', () => {
    const prefs = { ...defaultPrefs, color: 'random' } as const
    expect(startFromQuery('?side=black', prefs).colorChoice).toBe('black')
    expect(startFromQuery('?side=both', prefs).colorChoice).toBe('random')
  })

  it('keeps the opponent and the colours in step', () => {
    const friendly = { ...defaultPrefs, opponentId: 'friend' } as const
    // A computer asked for by the query takes a colour of its own, even
    // though the remembered game had two humans on one device.
    expect(startFromQuery('?vs=raven', friendly).setup).toEqual({
      opponentId: 'raven',
      humanColor: 'white',
      timeControlId: 'none',
    })
    // And the other way round: a friend plays both colours.
    const alone = { ...defaultPrefs, color: 'black' } as const
    expect(startFromQuery('?vs=friend', alone).setup).toEqual({
      opponentId: 'friend',
      humanColor: 'both',
      timeControlId: 'none',
    })
  })

  it('ignores an unknown opponent or colour', () => {
    expect(startFromQuery('?vs=dragon&side=green')).toEqual(defaultStart)
  })

  it('reports a malformed position instead of failing silently', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const start = startFromQuery('?pos=nonsense')
    expect(start.position).toBeNull()
    expect(start.setup).toEqual(untimedDefault)
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })
})
