import { moveKey } from '../engine/move.ts'
import { DB_DRAW_BAND, DB_WIN_MIN } from '../engine/db.ts'
import { applyMove } from '../game/apply.ts'
import { initialPosition, opposite, rankOf } from '../game/board.ts'
import {
  gameStatus,
  legalMoves,
  movablePieces,
  movesFrom,
} from '../game/moves.ts'
import type {
  Color,
  GameStatus,
  GameVariant,
  Move,
  Piece,
  Position,
  Square,
} from '../game/types.ts'
import type { TimeControl, TimeControlId, Timing } from '../game/timeControl.ts'
import { isTimed, timeControlOf } from '../game/timeControl.ts'
import type { OpponentId } from '../opponents/opponents.ts'
import {
  commitMove,
  createClock,
  flag as flagClock,
  flaggedAt,
  hasFlagged,
  remaining,
  seek,
  settle,
  stop,
} from './clock.ts'
import type { ClockState, Remaining } from './clock.ts'
import type { Flight } from './flight.ts'
import {
  canRedo,
  canUndo,
  createHistory,
  jumpTo,
  push,
  redo,
  undo,
} from './history.ts'
import type { History } from './history.ts'

export type GameSetup = {
  /** Which game the board is playing; see RULES.md. */
  readonly variant: GameVariant
  readonly opponentId: OpponentId
  /** 'both' = two humans on one device. */
  readonly humanColor: Color | 'both'
  /** Missing means an untimed game, which is what most games are. */
  readonly timeControlId?: TimeControlId
}

/**
 * What the persona made of the game when it last moved, read from its own
 * side: a mate score means it has a forced win, a score around nothing
 * means it sees no way past the other side.
 */
export type Verdict = {
  /** Ply it belongs to: the position the persona's move produced. */
  readonly ply: number
  readonly score: number
}

/** A result the players settled on instead of playing it out. */
export type Agreed = {
  readonly status: Exclude<GameStatus, 'ongoing'>
  /** Ply it was settled at, so an earlier position is still a live game. */
  readonly ply: number
}

/** What a persona may put to the human when it already knows the ending. */
export type OfferKind = 'draw' | 'resign'

export type GameState = {
  readonly history: History<Position>
  /** Whole timeline of moves; `moves[i]` leads from position i to i + 1. */
  readonly moves: ReadonlyArray<Move>
  /** Origin of the piece being moved. */
  readonly selected: Square | null
  /**
   * Landing squares already entered for a capture that is not complete
   * yet: the player chooses jump by jump when several captures share a
   * prefix. Empty otherwise.
   */
  readonly steps: ReadonlyArray<Square>
  /** Legs the piece should fly rather than appear to jump; transient. */
  readonly slide: Flight | null
  /** Colour shown nearest the viewer. */
  readonly orientation: Color
  readonly setup: GameSetup
  /** Id of the computer move being searched, if any; blocks input. */
  readonly thinking: number | null
  /** null in an untimed game; then nothing here concerns time at all. */
  readonly clock: ClockState | null
  /** The persona's reading of its own last move; null before it has moved. */
  readonly verdict: Verdict | null
  /** A draw agreed or a game given up; null while the board decides alone. */
  readonly agreed: Agreed | null
  /** Offers the human has turned down; a persona does not ask twice. */
  readonly declined: Readonly<Record<OfferKind, boolean>>
}

/**
 * Monotonic timestamp (`performance.now()`) at which the action happened.
 * The screen stamps every action; tests pass it by hand. An action without
 * one charges nobody: the clock keeps the turn it is already running.
 */
type Stamped = { readonly at?: number }

export type GameAction = (
  | { type: 'tap'; square: Square }
  /** Idempotent selection used when a drag starts. */
  | { type: 'select'; square: Square }
  | { type: 'deselect' }
  /** `slide` marks a move the player did not carry out by hand. */
  | { type: 'move'; from: Square; to: Square; slide?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Show the position after `index` moves (0 = start) without forgetting the rest. */
  | { type: 'jumpTo'; index: number }
  | { type: 'newGame'; setup: GameSetup }
  | { type: 'flipBoard' }
  /** A computer move with this id has been requested. */
  | { type: 'think'; id: number }
  /** The reply; ignored unless `id` is the pending request. */
  | {
      type: 'computerMove'
      id: number
      move: Move
      /** What the search made of the move, from the persona's own side. */
      score?: number
    }
  /** The human takes the persona up on the offer it is making. */
  | { type: 'accept'; offer: OfferKind }
  /** ...or turns it down, and is not asked again this game. */
  | { type: 'decline'; offer: OfferKind }
  /** The request failed or was lost; ignored unless `id` is pending. */
  | { type: 'thinkFailed'; id: number }
  /** A side's bank looks empty; dropped unless it really is. */
  | { type: 'flag'; color: Color }
) &
  Stamped

/** First launch: the fox, human plays white. */
export const defaultSetup: GameSetup = {
  variant: 'checkers',
  opponentId: 'fox',
  humanColor: 'white',
}

/** `position` starts the game somewhere other than the normal opening. */
export function initialState(
  setup: GameSetup = defaultSetup,
  position: Position = initialPosition(setup.variant),
  /** Omitted where there is no clock to read; a timed game starts frozen. */
  now?: number,
): GameState {
  const control = timeControlOf(setup.timeControlId)
  const started =
    now !== undefined && runs(position, true, setup.variant) ? now : null
  return {
    history: createHistory(position),
    moves: [],
    selected: null,
    steps: [],
    slide: null,
    orientation: setup.humanColor === 'black' ? 'black' : 'white',
    setup,
    thinking: null,
    clock: isTimed(control)
      ? createClock(control, setup.humanColor, started)
      : null,
    verdict: null,
    agreed: null,
    declined: { draw: false, resign: false },
  }
}

/**
 * Whether a clock should be ticking: on the live position of a game the
 * board has not already settled. The one rule behind every clock in this
 * file — starting one, moving one along the timeline, and charging one.
 */
function runs(
  position: Position,
  live: boolean,
  variant: GameVariant,
): boolean {
  return live && gameStatus(position, variant) === 'ongoing'
}

/** How many moves have been played into the position on the board. */
function plyOf(state: GameState): number {
  return state.history.past.length
}

/**
 * The moment an action happened. Missing in a timed game means the clock
 * must not move at all — better a turn charged to nobody than one charged
 * from a moment that never existed.
 */
function nowOf(action: GameAction): number | null {
  return action.at ?? null
}

export function currentPosition(state: GameState): Position {
  return state.history.present
}

/** The move that produced the current position, if any. */
export function lastMove(state: GameState): Move | null {
  return state.moves[state.history.past.length - 1] ?? null
}

/** True while an earlier position is displayed (there are moves ahead). */
export function isReviewing(state: GameState): boolean {
  return state.history.future.length > 0
}

export function statusOf(state: GameState): GameStatus {
  return gameStatus(currentPosition(state), state.setup.variant)
}

/**
 * How the game stands: the rules, unless a side ran out of time while the
 * position was still playable. A board that has already decided the game
 * decides it for good — a drawn ending does not become a loss because the
 * screen was left open. `statusOf` stays the rules alone, so the engine
 * knows nothing of clocks.
 */
export function outcome(state: GameState): GameStatus {
  return decided(
    statusOf(state),
    lostOnTime(state),
    agreedAt(state, plyOf(state)),
  )
}

/**
 * The board first, then the clock, then what the players settled between
 * them: an agreement is only ever reached on a position none of the others
 * had already decided.
 */
function decided(
  status: GameStatus,
  fallen: Color | null,
  settled: GameStatus | null,
): GameStatus {
  if (status !== 'ongoing') return status
  if (fallen !== null) return fallen === 'white' ? 'blackWins' : 'whiteWins'
  return settled ?? 'ongoing'
}

/** The agreement in force at `ply`, if the players had reached one by then. */
function agreedAt(state: GameState, ply: number): GameStatus | null {
  const agreed = state.agreed
  return agreed !== null && agreed.ply <= ply ? agreed.status : null
}

/**
 * The position the game ended on, whatever is being shown. The result
 * screen is about the whole game, so reviewing an earlier position must
 * not make its result disappear.
 */
export function finalPosition(state: GameState): Position {
  const future = state.history.future
  return future[future.length - 1] ?? state.history.present
}

/** Ply the timeline ends on; the position after every move played. */
function endPly(state: GameState): number {
  return state.history.past.length + state.history.future.length
}

/** How the game ended, read at the end of the timeline rather than here. */
export function finalOutcome(state: GameState): GameStatus {
  return decided(
    gameStatus(finalPosition(state), state.setup.variant),
    finalLostOnTime(state),
    agreedAt(state, endPly(state)),
  )
}

/** The agreement the game ended on, if it ended on one rather than on play. */
export function finalAgreed(state: GameState): Agreed | null {
  const agreed = state.agreed
  return agreed !== null && agreed.ply <= endPly(state) ? agreed : null
}

export function finalLostOnTime(state: GameState): Color | null {
  const clock = state.clock
  return clock === null ? null : flaggedAt(clock, endPly(state))
}

/**
 * The side that had lost on time by the position on the board, if any.
 * Like a win by the rules, the flag is read off the position shown: an
 * earlier one is live again, and coming back to the end brings it back.
 */
export function lostOnTime(state: GameState): Color | null {
  const clock = state.clock
  return clock === null ? null : flaggedAt(clock, plyOf(state))
}

/** Everything the clock readouts need, already resolved for `now`. */
export type ClockView = {
  readonly control: TimeControl
  /** Bank and increment of each colour; the two may differ. */
  readonly timings: Readonly<Record<Color, Timing>>
  readonly remaining: Remaining
  /** The side being charged right now; null while frozen or over. */
  readonly running: Color | null
  readonly flagged: Color | null
}

/** null in an untimed game, which is how the screen knows to show nothing. */
export function clockView(state: GameState, now: number): ClockView | null {
  const clock = state.clock
  if (clock === null) return null
  const toMove = currentPosition(state).toMove
  return {
    control: clock.control,
    timings: clock.timings,
    remaining: remaining(clock, plyOf(state), toMove, now),
    running: clock.startedAt === null ? null : toMove,
    flagged: lostOnTime(state),
  }
}

/**
 * A lead the persona has nothing to show for. `MAN_VALUE` in the engine's
 * evaluation is 100, so this is under half a man — small enough to be the
 * tempo and piece-square noise a level position is always worth.
 */
// A position the tables call drawn carries a squeezed evaluation rather
// than a plain zero, so the band has to fit inside what reads as level.
const LEVEL_SCORE = Math.max(40, DB_DRAW_BAND)

/**
 * Plies of kings shuffling about before the persona will call a level
 * position a draw. The engine's own `DRAW_PLIES` ends such a game at
 * thirty; well before that both sides already know how it goes.
 */
const SHUFFLE_PLIES = 12

/**
 * What the persona is putting to the human right now, if anything. It only
 * ever speaks about the position its own last move produced: a forced win
 * it has already found, or a position it cannot get anywhere in while the
 * kings walk up and down. An offer turned down is not made again.
 */
export function currentOffer(
  state: GameState,
  /** How the game stands; computed here unless the caller has it already. */
  status: GameStatus = outcome(state),
): OfferKind | null {
  const verdict = state.verdict
  // Not the position it judged: an earlier one is being reviewed, or the
  // human has since replied and the reading is about a game that moved on.
  if (verdict === null || verdict.ply !== plyOf(state)) return null
  if (state.setup.humanColor === 'both') return null
  if (status !== 'ongoing') return null
  // A mate it has seen, or an ending the tables call won: both are games
  // the human cannot save.
  if (verdict.score >= DB_WIN_MIN) {
    return state.declined.resign ? null : 'resign'
  }
  const level = Math.abs(verdict.score) <= LEVEL_SCORE
  if (level && currentPosition(state).drawCounter >= SHUFFLE_PLIES) {
    return state.declined.draw ? null : 'draw'
  }
  return null
}

/** True when a persona should be asked for a move: its turn, live, ongoing. */
export function computerToMove(state: GameState): boolean {
  const human = state.setup.humanColor
  if (human === 'both' || isReviewing(state)) return false
  if (outcome(state) !== 'ongoing') return false
  return currentPosition(state).toMove !== human
}

/**
 * Against a persona, undo on the live tail leaves the human on move: the
 * reply is taken back together with the human move. While reviewing, undo
 * and redo step one ply at a time so every position stays reachable; redo
 * therefore always steps once. A lone first move of the persona cannot be
 * undone.
 */
function undoSteps(state: GameState): number {
  const h = state.history
  if (!canUndo(h)) return 0
  const human = state.setup.humanColor
  if (human === 'both' || isReviewing(state) || h.present.toMove !== human) {
    return 1
  }
  return h.past.length >= 2 ? 2 : 0
}

function redoSteps(state: GameState): number {
  return canRedo(state.history) ? 1 : 0
}

/** The human acts only on their own turn (always, for two humans). */
function humanOnMove(state: GameState): boolean {
  const human = state.setup.humanColor
  return human === 'both' || currentPosition(state).toMove === human
}

/** No input once the game is over, while the persona thinks, or on its turn. */
function inputBlocked(state: GameState): boolean {
  return (
    outcome(state) !== 'ongoing' ||
    state.thinking !== null ||
    !humanOnMove(state)
  )
}

export function canUndoGame(state: GameState): boolean {
  return undoSteps(state) > 0
}

export function canRedoGame(state: GameState): boolean {
  return redoSteps(state) > 0
}

/**
 * Where the selected piece is shown: on its last landing square while a
 * capture is being entered, otherwise on its origin.
 */
export function selectedSquare(state: GameState): Square | null {
  return state.steps[state.steps.length - 1] ?? state.selected
}

/**
 * The position as the board should show it. Mid-capture the moving piece
 * stands on its last landing square; captured pieces stay until the move
 * is complete, exactly as the rules have it.
 */
export function displayPosition(state: GameState): Position {
  const position = currentPosition(state)
  const from = state.selected
  const to = selectedSquare(state)
  if (from === null || to === null || from === to) return position
  const board: (Piece | undefined)[] = position.board.slice()
  const piece = board[from]
  board[to] = piece === undefined ? undefined : shownPiece(piece, state.steps)
  board[from] = undefined
  return { ...position, board }
}

/**
 * A man that landed on the back rank during the capture became a king at
 * that moment and goes on as one, so it is shown as a king. Only checkers
 * gets here with steps: an уголки chain is played the moment its end is
 * tapped, so nothing of it is ever shown half-way.
 */
function shownPiece(piece: Piece, steps: ReadonlyArray<Square>): Piece {
  if (piece.kind === 'king') return piece
  const backRank = piece.color === 'white' ? 7 : 0
  return steps.some((square) => rankOf(square) === backRank)
    ? { color: piece.color, kind: 'king' }
    : piece
}

/** Legal moves of the selected piece that agree with the steps so far. */
export function candidates(state: GameState): Move[] {
  if (state.selected === null) return []
  return movesFrom(
    currentPosition(state),
    state.selected,
    state.setup.variant,
  ).filter((move) => state.steps.every((square, i) => move.path[i] === square))
}

/**
 * Squares the player may tap next: the next landing square of every
 * candidate, plus final squares that identify a single candidate so a
 * whole capture can be entered in one tap when it is unambiguous.
 */
export function targets(state: GameState): Square[] {
  const moves = candidates(state)
  const k = state.steps.length
  const squares = new Set<Square>()
  const finals = new Map<Square, number>()
  for (const move of moves) {
    const next = move.path[k]
    if (next !== undefined) squares.add(next)
    finals.set(move.to, (finals.get(move.to) ?? 0) + 1)
  }
  for (const [square, count] of finals) if (count === 1) squares.add(square)
  return [...squares]
}

/** Pieces the player may pick up right now. */
export function movable(state: GameState): Square[] {
  if (inputBlocked(state)) return []
  const shown = selectedSquare(state)
  return movablePieces(currentPosition(state), state.setup.variant).map(
    (square) => (square === state.selected && shown !== null ? shown : square),
  )
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'tap':
      return tap(state, action.square, nowOf(action))
    case 'select':
      return select(state, action.square)
    case 'deselect':
      return clearSelection(state)
    case 'move':
      return move(
        state,
        action.from,
        action.to,
        action.slide ?? false,
        nowOf(action),
      )
    case 'undo': {
      const steps = undoSteps(state)
      if (steps === 0) return state
      let history = state.history
      for (let i = 0; i < steps; i++) history = undo(history)
      return travelled(state, history, nowOf(action))
    }
    case 'redo': {
      const steps = redoSteps(state)
      if (steps === 0) return state
      let history = state.history
      for (let i = 0; i < steps; i++) history = redo(history)
      return travelled(state, history, nowOf(action))
    }
    case 'jumpTo':
      return travelled(
        state,
        jumpTo(state.history, action.index),
        nowOf(action),
      )
    case 'newGame':
      return initialState(action.setup, undefined, action.at)
    case 'flipBoard':
      return { ...state, orientation: opposite(state.orientation) }
    case 'think':
      // A search asked for on the position before the flag fell: the game
      // is over, so the request is refused and the screen, seeing nothing
      // pending, cancels it.
      if (outcome(state) !== 'ongoing') return state
      // The move that provoked the request may still be flying in, so the
      // selection goes but the slide stays: clearing it here would cancel
      // the animation a tick after it started.
      return { ...state, selected: null, steps: [], thinking: action.id }
    case 'computerMove':
      return computerMove(state, action, nowOf(action))
    case 'accept':
      return accepted(state, action.offer, nowOf(action))
    case 'decline':
      // Guarded like `accept`: an answer to a question nobody asked must
      // not silence an offer the player has never seen.
      if (currentOffer(state) !== action.offer) return state
      return {
        ...state,
        declined: { ...state.declined, [action.offer]: true },
      }
    case 'thinkFailed':
      return state.thinking === action.id ? { ...state, thinking: null } : state
    case 'flag':
      return flagged(state, action.color, nowOf(action))
  }
}

/**
 * Lands on another position of the timeline and puts the clock back to
 * what it showed there. The clock runs again only on the live position of
 * a game that is still going: reviewing freezes it, and a position from
 * before the flag fell is a position the game had not yet been lost on.
 */
function travelled(
  state: GameState,
  history: History<Position>,
  now: number | null,
): GameState {
  const clock = state.clock
  // Landing on the position already shown is not navigation: the clock
  // must not be handed a fresh turn for a click that changed nothing.
  const moved = history !== state.history
  const ply = history.past.length
  // The board may be playable there and the game still over: stepping back
  // onto a position the players settled on must not set the clock going
  // again, or the flag would fall on a game that already had its result.
  const running =
    runs(history.present, history.future.length === 0, state.setup.variant) &&
    agreedAt(state, ply) === null
  const next = clock === null || !moved ? clock : seek(clock, ply, running, now)
  return {
    ...clearSelection(state),
    history,
    thinking: null,
    clock: next,
  }
}

/**
 * Ends the game on time. A claim is only believed when it names the side
 * to move and that side really has nothing left at `now`, so a timer that
 * fired late, twice, or for a game that has moved on changes nothing.
 */
function flagged(
  state: GameState,
  color: Color,
  now: number | null,
): GameState {
  const clock = state.clock
  if (clock === null || now === null) return state
  const ply = plyOf(state)
  // Anything that has already decided the game — the board, an earlier
  // flag, an agreement between the players — decides it for good.
  if (outcome(state) !== 'ongoing') return state
  const toMove = currentPosition(state).toMove
  if (color !== toMove) return state
  if (!hasFlagged(clock, ply, toMove, now)) return state
  return {
    ...clearSelection(state),
    clock: flagClock(clock, toMove, ply),
    thinking: null,
  }
}

/** Plays the reply to the pending request; anything stale or illegal is dropped. */
function computerMove(
  state: GameState,
  action: Extract<GameAction, { type: 'computerMove' }>,
  now: number | null,
): GameState {
  if (state.thinking !== action.id) return state
  const key = moveKey(action.move)
  const played = legalMoves(currentPosition(state), state.setup.variant).find(
    (candidate) => moveKey(candidate) === key,
  )
  const idle = { ...state, thinking: null }
  if (played === undefined) return idle
  // The reading belongs to the position the move produces, one ply on.
  const verdict =
    action.score === undefined
      ? null
      : { ply: plyOf(state) + 1, score: action.score }
  return commit(idle, played, played, now, verdict)
}

/**
 * Settles the game the way the persona offered to. Only the offer actually
 * on the table is honoured, so a click that raced the position it was made
 * about changes nothing. The turn the player spent making up their mind is
 * charged like any other, and a bank that emptied while the offer stood
 * ends the game before the agreement can: the flag fell first.
 */
function accepted(
  state: GameState,
  offer: OfferKind,
  now: number | null,
): GameState {
  if (currentOffer(state) !== offer) return state
  const ply = plyOf(state)
  const toMove = currentPosition(state).toMove
  const clock = state.clock
  if (clock !== null && now !== null && hasFlagged(clock, ply, toMove, now)) {
    return flagged(state, toMove, now)
  }
  const status: Exclude<GameStatus, 'ongoing'> =
    offer === 'draw'
      ? 'draw'
      : // The human gives the game up, so the other colour takes it.
        state.setup.humanColor === 'white'
        ? 'blackWins'
        : 'whiteWins'
  return {
    ...clearSelection(state),
    agreed: { status, ply },
    thinking: null,
    clock: clock === null ? null : settle(clock, ply, toMove, now),
  }
}

function clearSelection(state: GameState): GameState {
  if (state.selected === null && state.slide === null) return state
  return { ...state, selected: null, steps: [], slide: null }
}

function select(state: GameState, square: Square): GameState {
  if (inputBlocked(state)) return state
  if (square === selectedSquare(state)) return state
  if (!canPickUp(state, square)) return state
  return { ...state, selected: square, steps: [] }
}

function tap(state: GameState, square: Square, now: number | null): GameState {
  if (inputBlocked(state)) return state
  if (state.selected !== null && targets(state).includes(square)) {
    return step(state, square, true, now)
  }
  // Any other tap abandons a capture in progress and counts as a fresh tap.
  if (state.selected === square) return { ...state, selected: null, steps: [] }
  const own = canPickUp(state, square)
  return { ...state, selected: own ? square : null, steps: [] }
}

/** Whether a piece stands on `square` and has a move to make. */
function canPickUp(state: GameState, square: Square): boolean {
  return movablePieces(currentPosition(state), state.setup.variant).includes(
    square,
  )
}

function move(
  state: GameState,
  from: Square,
  to: Square,
  slide: boolean,
  now: number | null,
): GameState {
  if (inputBlocked(state)) return state
  let s = state
  if (from !== selectedSquare(state)) {
    if (!canPickUp(state, from)) return state
    s = { ...state, selected: from, steps: [] }
  }
  if (!targets(s).includes(to)) return state
  return step(s, to, slide, now)
}

/**
 * Enters `square` as the next landing square. One remaining candidate is
 * played at once (the rest of its path is forced); several keep the piece
 * in the air, but only as far as the first square they disagree on, so a
 * jump the player cannot get wrong never waits to be entered. A final
 * square that identifies a single candidate plays that candidate.
 *
 * With one exception, made for уголки, where a chain may stop on any
 * landing square: when one of the candidates lands on `square` next and
 * stops there while others go on through it, the tap means that move. At
 * a3 → c3 → c1, a player who taps c3 means c3; c1 is a tap on c1.
 * Checkers never has the choice - a capture that can go on must, and two
 * candidates on the same squares with the same pieces taken go on the
 * same way - so nothing changes there.
 */
function step(
  state: GameState,
  square: Square,
  tapped: boolean,
  now: number | null,
): GameState {
  const moves = candidates(state)
  const k = state.steps.length
  // Every one of these lands on `square` next, so it is the first of the
  // landing squares still to come and the one a drag has reached.
  const next = moves.filter((move) => move.path[k] === square)
  const stopsHere = next.filter((move) => move.path.length === k + 1)
  if (next.length === 1 || stopsHere.length === 1) {
    const only = stopsHere[0] ?? next[0]!
    return commit(state, only, flight(state, only.path.slice(k), tapped), now)
  }
  if (next.length > 1) {
    const steps = [...state.steps, square]
    while (agree(next, steps.length)) steps.push(next[0]!.path[steps.length]!)
    return { ...state, steps, slide: flight(state, steps.slice(k), tapped) }
  }
  const finals = moves.filter((move) => move.to === square)
  if (finals.length !== 1) return state
  // The whole move from one tap on its last square. A drag that lands
  // there has carried the piece the whole way, so nothing is left to fly.
  const played = finals[0]!
  const rest = played.path.slice(k)
  return commit(
    state,
    played,
    tapped ? flightFrom(selectedSquare(state), rest) : null,
    now,
  )
}

/** Every candidate lands on the same square next: there is nothing to choose. */
function agree(moves: ReadonlyArray<Move>, k: number): boolean {
  const next = moves[0]!.path[k]
  return next !== undefined && moves.every((move) => move.path[k] === next)
}

/**
 * The legs the piece covers on its own, so the board can fly it over them
 * instead of letting it appear somewhere else. A tap moves nothing, so the
 * piece flies from where it stands across all of `landings`; a drag has
 * already carried it to the first of them, so only the rest is flown.
 */
function flight(
  state: GameState,
  landings: ReadonlyArray<Square>,
  tapped: boolean,
): Flight | null {
  return tapped
    ? flightFrom(selectedSquare(state), landings)
    : flightFrom(landings[0], landings.slice(1))
}

/** Nothing flies from nowhere, and nothing flies over no ground. */
function flightFrom(
  from: Square | null | undefined,
  path: ReadonlyArray<Square>,
): Flight | null {
  if (from === null || from === undefined || path.length === 0) return null
  return { from, path }
}

/**
 * Plays the move and charges the mover for the turn. A move that only
 * lands once the bank is empty — the tab was away, the timer had not
 * fired yet — is not played at all: the flag fell first.
 */
function commit(
  state: GameState,
  played: Move,
  slide: Flight | null,
  now: number | null,
  /** The persona's reading of the move; a human move carries none. */
  verdict: Verdict | null = null,
): GameState {
  const position = currentPosition(state)
  const ply = plyOf(state)
  const clock = state.clock
  // The game was already lost on time here; nothing may be played from it.
  if (clock !== null && flaggedAt(clock, ply) !== null) return state
  if (
    clock !== null &&
    now !== null &&
    hasFlagged(clock, ply, position.toMove, now)
  ) {
    return flagged(state, position.toMove, now)
  }
  const next = applyMove(position, played)
  const charged =
    clock === null ? null : commitMove(clock, ply, position.toMove, now)
  return {
    ...state,
    history: push(state.history, next),
    // Making a move from an undone position starts a new line.
    moves: [...state.moves.slice(0, ply), played],
    selected: null,
    steps: [],
    slide,
    // The mover pays for the move that ended the game, and then the clock
    // stops with it: nobody is on move, so nobody is being charged.
    clock:
      charged === null || runs(next, true, state.setup.variant)
        ? charged
        : stop(charged),
    verdict,
    // A move can only be played where nothing has been agreed, so anything
    // standing belongs to the line this move has just abandoned.
    agreed: null,
  }
}
