import { describe, expect, it } from 'vitest'
import { squareFromName } from '../../game/board.ts'
import { fromBitPosition } from '../adapter.ts'
import { initialBitPosition, parsePos } from '../position.ts'
import { describeRules } from '../rulesSuite.ts'
import {
  mailboxApply,
  mailboxMoves,
  mailboxPerft,
  uniqueMoves,
} from './mailbox.ts'

describeRules('mailbox', (p) => mailboxMoves(fromBitPosition(p)))

describe('mailbox apply', () => {
  it('removes captured pieces, moves the piece and promotes', () => {
    const position = fromBitPosition(parsePos('W:Wb6:Bc7,f6'))
    const [move] = mailboxMoves(position)
    if (move === undefined) throw new Error('no move')
    const next = mailboxApply(position, move)
    expect(next.toMove).toBe('black')
    expect(next.board[squareFromName('b6')]).toBeUndefined()
    expect(next.board[squareFromName('c7')]).toBeUndefined()
    expect(next.board[squareFromName('f6')]).toBeUndefined()
    expect(next.board[move.to]).toEqual({ color: 'white', kind: 'king' })
    expect(position.board[squareFromName('b6')]).toBeDefined()
  })

  it('throws when the origin is empty', () => {
    const position = fromBitPosition(parsePos('W:Wb6:B'))
    expect(() =>
      mailboxApply(position, {
        from: 0,
        to: 9,
        captures: [],
        promotes: false,
        path: [9],
      }),
    ).toThrow('no piece')
  })
})

describe('mailbox perft', () => {
  it('counts distinct moves', () => {
    const fiveBear = fromBitPosition(parsePos('W:Wd2:Bc3,e3,c5,e5,g3'))
    expect(mailboxMoves(fiveBear)).toHaveLength(4)
    expect(uniqueMoves(mailboxMoves(fiveBear))).toHaveLength(3)
    expect(mailboxPerft(fiveBear, 1)).toBe(3)
  })

  it('matches the known opening counts', () => {
    const initial = fromBitPosition(initialBitPosition())
    expect(mailboxPerft(initial, 0)).toBe(1)
    expect(mailboxPerft(initial, 1)).toBe(7)
    expect(mailboxPerft(initial, 2)).toBe(49)
  })
})
