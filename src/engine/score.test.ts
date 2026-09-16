import { describe, expect, it } from 'vitest'
import { EVAL_MAX } from './eval.ts'
import {
  INF,
  MATE,
  MATE_BOUND,
  MAX_PLY,
  isMateScore,
  matedScore,
} from './score.ts'

describe('score bands', () => {
  it('keeps evaluations, mate scores and infinity apart', () => {
    expect(EVAL_MAX).toBeLessThan(MATE_BOUND)
    expect(MATE_BOUND).toBe(MATE - MAX_PLY)
    expect(MATE).toBeLessThan(INF)
  })

  it('recognises every mate score within MAX_PLY and no evaluation', () => {
    for (let ply = 0; ply <= MAX_PLY; ply++) {
      expect(isMateScore(matedScore(ply))).toBe(true)
      expect(isMateScore(-matedScore(ply))).toBe(true)
    }
    expect(isMateScore(EVAL_MAX)).toBe(false)
    expect(isMateScore(-EVAL_MAX)).toBe(false)
    expect(isMateScore(0)).toBe(false)
  })

  it('prefers the shorter win and the longer loss', () => {
    expect(-matedScore(3)).toBeGreaterThan(-matedScore(5))
    expect(matedScore(5)).toBeGreaterThan(matedScore(3))
  })
})
