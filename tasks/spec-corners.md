# Spec: Уголки (Russian corners)

Status: **implemented.** Kept up to date as decisions changed during the
work; the sections below say where the build differs from the first draft
and why.

## Objective

Add уголки as the third game, reachable from the navbar tab that has been
disabled and labelled «скоро» since the beginning (`src/ui/NavBar.tsx`).

Уголки is not a checkers variant. Nothing is captured, there are no kings,
every square of the board is in play, and the objective is a race: move all
nine men from one's own corner into the opponent's. The rules are in
`RULES.md` under "Уголки".

Who it is for: the same player, wanting the third game of the Russian
шашки set. Success means they pick Уголки from the navbar, play it against
any of the five personas or a friend on the same device, on a clock if they
want, and the personas play a race sensibly: a beginner shuffles, the birds
of prey plan jump chains and never leave a man behind.

## What is shared and what is not

The поддавки work made checkers a `Variant` of one engine: the same board,
the same generator, one rule changed. Уголки shares none of that with the
checkers engine — not the 32-square bitboards, not the generator, not the
capture search, not the endgame tables — so it gets an engine of its own in
`src/corners/`. Forcing it into `src/engine/` would put a second board
representation into every hot-path function of the first.

What it does share is everything above the engine:

- the UI-facing `Position` and `Move` types (`src/game/types.ts`): a corners
  move is a `Move` with no captures, no promotion and a `path` of landing
  squares, so the board, the drag, the flight animation, the step-by-step
  entry of a jump chain and the move list all work unchanged;
- the `game/` layer, which dispatches on `GameVariant`, the way it already
  does for `gameStatus`;

  _Changed during the build._ The reducer's chain entry now plays a tapped
  square that is the end of exactly one candidate before it considers the
  square as a way onward. At уголки a chain may stop on any landing
  square, so c3 can be both where a3 stops and the way to c1; the first
  live game left the man hanging on c3 waiting for a second tap, which
  read as a bug. Checkers never has that choice, so nothing changes there;

- the reducer, clocks, history, preferences, startup and the whole UI;
- the persona table and the `Thinker`/worker plumbing, with the request
  saying which game it is;
- the score bands of `engine/score.ts`, so a mate score means the same thing
  to the resignation offer whichever game produced it.

## Rules

See `RULES.md`. The choices made where the tradition varies:

- **3×3 homes, nine men.** The layout the Russian article names first; a
  game of some thirty moves a side. The layout is one table in
  `corners/board.ts`, so a 3×4 or 4×4 setting is a later possibility, not a
  rewrite.
- **Orthogonal only** ("классические уголки").
- **Black's answer.** White moves first, so a Black finish on the very next
  move after White's is a draw.
- **Blocking rules from the online game**, counted in plies from the start
  position: from ply 80 on, a man in one's own home loses; at ply 160 the
  side with more men in the target wins, equal is a draw. These make every
  game finite, which the search also relies on.
- **No legal move loses.** Practically unreachable; needs a rule anyway.

## Technical Design

### 1. Position

`Position` gains `ply`: the number of plies played to reach it from where
the game started. `applyMove` counts it for every game; checkers ignores
it, уголки reads it for the two blocking limits. `drawCounter` keeps its one
meaning (quiet king plies) and stays at zero in уголки.

The variant is passed explicitly, as `gameStatus` already has it:
`legalMoves(position, variant)`, `initialPosition(variant)`. No defaults on
the rules path — the compiler finds every call site.

### 2. Engine (`src/corners/`)

A mailbox engine. Sixty-four cells do not fit one int32, and the game has
no bit-parallel structure worth two: a move is a walk from one man's
square, so the generator walks.

- `board.ts` — squares, the two homes, distance tables, the opening
  position, an ASCII board for the console.
- `position.ts` — the literal `W:Wa1,b1,…:Bf6,…:12` (side, white men,
  black men, plies played), parsed into and formatted from the UI
  `Position`. The engine has no position object of its own: a search
  loads a `Position` into module-level cells once and mutates them in
  place.
- `movegen.ts` — `generate(side, out, base)` writes packed moves
  (`from | to << 6`) for the search; `generateDetailed(position)` returns
  UI `Move`s with the shortest jump path to each destination. One move per
  destination: the path is animation, not identity.
- `status.ts` — the terminal rules above, on the loaded board.
- `eval.ts` — see 3.
- `tt.ts` — the position as four bitboard words plus `side | ply << 1`,
  verified exactly on a hit like the checkers table; eight int32 slots per
  entry. It hashes with the checkers table's murmur steps, which
  `engine/hash.ts` now exports; that and the score bands are all the two
  engines share.
- `search.ts` — negamax, PVS, iterative deepening, transposition table,
  killers and history, time budget. No quiescence: there is nothing to
  resolve. The root has the same margin semantics and the same
  `[move, 0, score, bound]` layout as the checkers root so `pickRoot`
  serves both.

### 3. Evaluation

A race is measured in distance. For each man, a cost by square:

- outside the target, `100` per square of Manhattan distance to the nearest
  target square, plus the cost of the target's entrance;
- inside the target, `20` per square of distance to the far corner, so the
  back fills first and the entrance stays clear.

The score is the opponent's cost minus one's own, plus a straggler term on
the most expensive man of each side (leaving one man behind loses races),
plus tempo. The harness (`weights`, `weightsB`, `selfplay variant=corners`)
ships with the code as it did for поддавки.

_What the measurements said._ One change at a time against the shipped set,
`owl vs owl` over a hundred games or more (`tasks/todo-corners.md`): the
inside term is the spine — without it the men entering the target stop at
the entrance and wall the rest out, and the shipped set wins 80% — the
straggler term is worth twenty points and sits on a plateau from 50 to 100,
and tempo is even to the game over 300 games. The one number the games
moved was the inside weight, from the first guess of 10 to 20, by 55% over
300 games. Nothing measured overturned the reasoning, which is the opposite
of the поддавки experience and says more about a race being simpler than
about the reasoning.

### 4. Opponents

The five personas play уголки on the same table. A square is 100 points,
so the margins keep their meaning: the kitten picks among moves within four
squares of the best, the fox within a third of one. `think.ts` searches the
game the request names; the worker never fetches the endgame tables for a
session that plays уголки.

_Changed during the build._ `pickRoot` plays a win it has found the
shortest way, whatever the margin. The first self-play games showed the fox
filling its target and then wandering inside it: a finish in three and a
finish in four differ by two points, both sat inside its margin of thirty,
and the softmax kept choosing the longer one. Mate scores are plies, not
evaluation, and are not blurred. The rule holds at checkers too, where it
had simply never shown, because a found win there ends in captures the
opponent cannot avoid.

### 5. UI

- NavBar: the third tab goes live; nothing is «скоро» any more.
- Board: nothing marks the homes. A faint tint over them was tried and
  taken out after the first games: the corners are plain to see, and the
  deadline ring below says what matters about them.
- Notation: `a1-a3-c3` for a chain.
- Result screen: reasons for the corners endings; the statistics rows are
  jumps rather than captures; the chart shows the lead in squares left.
- Banter: a remark on a long jump chain.
- Deadline: from ten moves before the home rule is read, the bubble counts
  the player's moves down and the board rings the men still at home; the
  result screen names the men the rule caught, and the board rings them.
  _Added after the first games._ The hare walled a late man in on purpose
  and won on the rule at move 40, which the player took for a bug: the
  rule is the traditional one and stays, but it has to be visible before
  it strikes.

## Testing

Vitest beside the subject, as everywhere:

1. Generator against a plain reference over random positions; the opening
   move count.
2. Terminal rules at every layer: finish, Black's answer, both blocking
   limits.
3. Search finds a forced finish; TT keeps plies apart.
4. Evaluation: mirror antisymmetry, bounds inside `EVAL_MAX`.
5. Game layer, reducer, startup and prefs with the new variant; the navbar
   tab; a game played to a finish in the browser tests.
6. Strength measured by self-play and recorded in `tasks/todo-corners.md`.

## Boundaries

As for поддавки: `npm run check` before every commit, timings from
`npm run bench` only, Russian text in `src/i18n/ru.ts`, no default variant
anywhere on the rules path, ask before a dependency or a change to checkers
play.
