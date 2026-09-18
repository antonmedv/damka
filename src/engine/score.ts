/**
 * Score bands shared by the search and the transposition table.
 *
 * Scores are int32 from the side to move. A loss at ply `p` (root = 0)
 * scores `-(MATE - p)`, so a shorter win and a longer loss win ties. With
 * `p <= MAX_PLY` every mate score satisfies `|s| >= MATE_BOUND`, and the
 * evaluation stays inside `EVAL_MAX < MATE_BOUND`, so the two bands never
 * touch: a score is a mate score exactly when `|s| >= MATE_BOUND`.
 */
export const MAX_PLY = 64
export const MATE = 30000
export const INF = 32000
export const MATE_BOUND = MATE - MAX_PLY
export const DRAW_SCORE = 0

/** Score of the side to move when it has lost at `ply`. */
export function matedScore(ply: number): number {
  return -(MATE - ply)
}

/**
 * Score of the side to move when it has won at `ply`: the поддавки mirror
 * of `matedScore`, where being unable to move is the winning condition. A
 * shorter win still beats a longer one, so the search converts at once
 * rather than shuffling.
 */
export function matingScore(ply: number): number {
  return MATE - ply
}

export function isMateScore(score: number): boolean {
  return score >= MATE_BOUND || score <= -MATE_BOUND
}
