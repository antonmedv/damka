# Spec: Поддавки (Russian giveaway checkers)

Status: **implemented.** Kept up to date as decisions changed during the
work; the sections below say where the build differs from the first draft
and why.

## Objective

Add Поддавки as a second playable game alongside Russian checkers, reachable
from the navbar tab that is currently disabled and labelled «скоро»
(`src/ui/NavBar.tsx:7`, `src/i18n/ru.ts:23`).

Поддавки uses every movement rule of Russian checkers unchanged and inverts
only the objective: the player who can no longer move — because they have no
pieces or because every piece is blocked — **wins**.

Who it is for: the same player who plays the existing game, wanting the other
half of the Russian checkers tradition. Success means they can pick Поддавки
from the navbar, play it against any of the five personas or against a friend
on the same device, and get an opponent whose strength ladder holds up the way
it does in checkers.

The work has two parts of very different size. The rules change is small and
exactly specifiable. The evaluation is a research task: checkers evaluation
terms do not simply negate, so the giveaway evaluation gets its own term set
and its own self-play tuning loop, and its weights are decided by measurement
rather than by assertion.

## Rules

Identical to `RULES.md` for board, pieces, movement, mandatory captures, choice
among capture sequences, flying kings, promotion (including promotion in the
middle of a capture sequence), and the simplified 30-ply quiet-king draw rule.

The only difference:

### Winning

A player **wins** if, at the start of their turn:

- they have no pieces; or
- they have no legal moves.

This is the exact inverse of the checkers rule, and it is the whole of the
variant. Move generation is bit-for-bit the same, which the test suite asserts
rather than assumes (see Testing Strategy).

`RULES.md` gains a short "Поддавки" section stating this, so the two variants
are documented in one place.

## Tech Stack

Unchanged from the existing project:

- TypeScript ~6.0, React 19.2, Vite 8.3
- Engine: hand-written bitboard move generation, alpha-beta search in a Web
  Worker (`src/opponents/search.worker.ts`)
- Tests: Vitest 5 + Testing Library, jsdom
- Lint/format: oxlint 1.81, oxfmt 0.67
- Endgame tables: Go generator in `dbgen/` — **not touched by this work**

No new dependencies. If one seems necessary, that is an "ask first" moment.

## Commands

```
Dev:        npm run dev
Build:      npm run build
Test:       npm test
Watch:      npm run test:watch
Coverage:   npm run test:coverage
Typecheck:  npm run typecheck
Lint:       npm run lint
Lint fix:   npm run lint:fix
Format:     npm run format
Gate:       npm run check          # typecheck + lint + format:check + test
Bench:      npm run bench          # rolldown bundle + node; the only valid timing source
Self-play:  npm run selfplay -- games=40 scale=0.05 seed=1 pairs=owl-fox
```

Engine timings come from `npm run bench` only. Vitest numbers are distorted
5–20x by its getters and are not evidence about search speed.

## Project Structure

Existing layout, with the new files marked:

```
src/engine/        Bitboard engine: movegen, search, eval, TT, endgame DB
  variant.ts       NEW: the Variant type and its two constants
  evalGiveaway.ts  NEW: giveaway evaluation
  status.ts        CHANGED: terminal condition takes a variant
  search.ts        CHANGED: variant threads through the tree
  tt.ts            CHANGED: variant enters the meta word
src/game/          UI-facing rules layer over the engine
  moves.ts         CHANGED: gameStatus takes a variant
src/opponents/     Personas, worker glue, self-play tournament
  personas.ts      CHANGED (possibly): a giveaway persona table if tuning needs one
  think.ts         CHANGED: request carries the variant
src/state/         Reducer, preferences, startup, clock, history, stats
src/ui/            React components, one CSS file each
  NavBar.tsx       CHANGED: the Поддавки tab becomes live
src/i18n/ru.ts     Russian strings; the only locale
tasks/             Spec, plan and task list for this work
dbgen/             Go endgame generator — untouched
```

Tests sit beside their subject as `*.test.ts` / `*.test.tsx`; that convention
does not change.

## Code Style

Match the surrounding code exactly. The engine's house style is dense integer
code with a long explanatory comment at the top of the module and short
comments only where the reason is not obvious from the code. Comments explain
_why_, and they are complete sentences.

Example of the style the new evaluation should read like — the existing
`evaluate` boundary, which the giveaway one mirrors:

```ts
/**
 * Score for the side to move. Takes the position as the search holds it:
 * both colours' kings in one bitboard, `side` 0 for White.
 */
export function evaluate(
  white: number,
  black: number,
  kings: number,
  side: number,
): number {
  const whiteMen = white & ~kings
  const whiteKings = white & kings
  // Black seen from its own side of the board, so White's tables apply.
  const blackMen = reverse32(black & ~kings)
  ...
}
```

Conventions that hold throughout and must hold in the new code:

- Positions travel as plain int32 arguments in the search, never as objects.
- Piece-square tables are built once at start-up and read through two 16-bit
  lookups, not per-bit loops; `pieceSquareSum` stays the slow reference the
  tests check the fast path against.
- Exported constants are `SCREAMING_SNAKE`, functions and locals `camelCase`,
  types `PascalCase`.
- Russian user-visible text lives only in `src/i18n/ru.ts`; components read `t`.
- oxfmt decides formatting. Never hand-format against it.

## Technical Design

### 1. The variant type

```ts
// src/engine/variant.ts
export const CHECKERS = 0
export const GIVEAWAY = 1
export type Variant = 0 | 1
```

An int, not a string, because it travels through the search's hot path and
through the TT meta word. The UI-facing string form (`'checkers' | 'giveaway'`)
lives in `src/game/types.ts` and is converted once at the boundary, the way
`Color` already converts to `WHITE`/`BLACK`.

### 2. Terminal condition

`src/engine/status.ts:26` is the entire rules difference:

```ts
// now
if (moveCount === 0) return side === WHITE ? BLACK_WINS : WHITE_WINS
// with the variant
if (moveCount === 0) {
  const whiteWins = variant === GIVEAWAY ? side === WHITE : side === BLACK
  return whiteWins ? WHITE_WINS : BLACK_WINS
}
```

The loss-before-draw ordering stays: the move that leaves the opponent without
a reply decides the game even on the 30th quiet king ply. That ordering is what
the Go reference does and it is right for both variants.

`statusOf`, `status` (`src/engine/status.ts:32`) and `gameStatus`
(`src/game/moves.ts:38`) each take the variant as a new parameter. None of them
gets a default value — a silent default here would let a giveaway game be
scored by checkers rules, which is the single worst bug this feature can have.

### 3. Search

`src/engine/search.ts` needs four changes, all mechanical:

| Site                                    | Now               | Giveaway                               |
| --------------------------------------- | ----------------- | -------------------------------------- |
| `search.ts:171,174` root status         | `matedScore(0)`   | `MATE` (the root side has already won) |
| `search.ts:391` no moves at a node      | `matedScore(ply)` | `MATE - ply`                           |
| `search.ts:388,424,526` leaf/quiescence | `evaluate(...)`   | `evaluateGiveaway(...)`                |
| `search.ts:416` endgame probe           | `dbProbe(...)`    | skipped                                |

`score.ts` gains `matingScore(ply) = MATE - ply` as the mirror of
`matedScore`; the mate-score band and `isMateScore` are untouched, so the
banter layer's draw and resignation offers keep working with no change.

The variant enters through `Limits` and is read once into a module local
beside `deadline`, `canAbort` and the node counters, rather than being carried
down every recursive call.

_Changed during the build._ The draft said to pass it as a recursion
parameter. `negamax` already takes nine, the variant is constant for a whole
search, and every other such constant in the file is already a module local, so
the parameter would have been both slower and out of keeping. `search` is
synchronous and never re-entered, which is what makes the module local safe.
One well-predicted branch per leaf; `npm run bench` confirms the checkers
search does not regress.

The repetition heuristic stays exactly as it is — a repeated position is a draw
in both variants.

### 4. Transposition table

The TT verifies a hit against the stored position words, not just the hash
(`src/engine/tt.ts:73`), so a checkers entry and a giveaway entry for the same
position would match each other and return a wrong score.

Fix in one line: fold the variant into the meta word.

```ts
// src/engine/tt.ts:59
export function metaOf(side: number, plies: number, variant: number): number {
  return side | (plies << 1) | (variant << 6)
}
```

`plies` never exceeds `DRAW_PLIES` (30), so `plies << 1` occupies bits 1–5 and
bit 6 is free. This costs nothing, needs no lifecycle tracking, and makes
cross-variant contamination impossible rather than merely unlikely. It is
strictly better than clearing the table on a variant switch, which would depend
on somebody remembering to call it.

### 5. Endgame tables

Disabled in Поддавки, using machinery that already exists rather than new code:

- `src/opponents/think.ts:72` becomes
  `dbLimit(variant === GIVEAWAY ? 0 : persona.endgamePieces)` — `dbLimit(0)`
  already means "look nothing up".
- `search.ts:416` skips the probe outright for giveaway, so a giveaway search
  does not even pay the `dbPieces` test.
- `src/opponents/search.worker.ts` skips `loader.fetchMissed` for giveaway
  requests, so a session that only plays Поддавки never downloads the 10 MB.

The tables encode checkers win/loss values and are simply wrong here. Per the
recorded measurement they are worth ≈0 Elo for fox/owl/raven anyway, so the
cost of going without them is small. Generating giveaway tables is explicitly
out of scope.

### 6. Giveaway evaluation

This is the substantial part of the work, and the part that is genuinely
uncertain. The checkers evaluation cannot be reused by negation: advancement,
the back-rank guard and the main-road king bonus all encode checkers
heuristics whose inverse is not the giveaway heuristic.

`src/engine/evalGiveaway.ts` gets its own term set, in the same shape as
`eval.ts` (piece-square tables folded into two 16-bit lookups, score from the
side to move, every score strictly inside `EVAL_MAX`):

- **material** — a man and a king each carry a weight whose _sign is a tuning
  result, not an assumption_. The folklore that a дамка is a burden in
  поддавки is plausible and widely repeated, and it is exactly the kind of
  claim self-play settles in an afternoon. The code must not bake it in.
- **advancement** — an inverted `ADVANCE` table: in giveaway, promotion is
  usually something to avoid, so pushing men up the board is discouraged.
- **tempo** — kept, same rationale as `TEMPO` in `eval.ts` (damping the
  odd/even swing between iterations).

_What the measurements said._ Reasoning chose the terms; self-play chose
between them, and twice overruled the reasoning.

Both hand-reasoned sets failed. One measured level against the negated baseline
(48.5% over 200 games), the other clearly worse (41.2%). What finally worked
came out of a sweep rather than an argument, and it is a smaller evaluation than
either: **a man is 100, a king 400, a man's burden rises with its rank, and that
is all**. It beats the baseline 57.0% over 400 games on a seed it was not
chosen on, 2.8 standard errors clear of even. On the seed it was chosen on it
scored 61.0%; that gap is the selection showing, and 57.0% is the number to
quote.

Two findings are worth keeping:

- **A king is much the heavier burden — heavier than the three men checkers
  values it at.** Every set with a light king lost; 300–800 all sit on a plateau
  around 57–61%. The reasoning that a flying king can offer itself at will, and
  is therefore easy to be rid of, is simply wrong: what dominates is that a king
  survives the exchanges that clear men away and gets dragged into the sequences
  that empty everyone else's side.
- **The border term earns nothing.** It rests on a fact that is true, and that
  is now asserted against the generator in `movegen.test.ts` — a piece on file
  a, file h, rank 1 or rank 8 cannot be captured at all, since every capture
  lands beyond the piece taken and beyond the border there is no board — and it
  still measured worse than leaving it out (59.2% against 53.0% at the same king
  weight). Safety cuts both ways at поддавки: a piece the other side cannot take
  is also a piece they cannot be made to take. The fact stayed as a rules test;
  the term went.

The planned opponent-mobility term was dropped without being built: it needs a
move count the evaluation does not have at every leaf, and the material term
already correlates with it.

The measurement harness — `baselineEval` and `weights` in `evalGiveaway.ts`,
`baseline=` and `weights=` in `selfplay` — ships with the code, on the same
footing as `dbLimit`: it is how these numbers were found and how the next person
will find better ones. Every run is in `tasks/todo.md`.

Move ordering (`search.ts`) looked like it should invert too: preferring the
capture that takes most pieces and promotes is the wrong guess at поддавки.
Ordering only affects speed, never correctness, so it was built, measured, and
then dropped — 100 self-play games each way reached the same depth in the same
time (14.25 plies with the inverted ordering, 14.25 with the checkers one). It
is not in the branch. What is there instead is a поддавки section in
`npm run bench`, so the next attempt has something to measure against.

**Tuning loop.** `npm run selfplay` is the instrument. The baseline opponent is
the naive negated-checkers evaluation; the giveaway evaluation has to beat it
by a clear margin over a few hundred games before its weights are frozen. The
`pairs`, `games`, `scale`, `seed` and `random` flags already support exactly
this; `selfplay.ts` needs a `variant=` flag and giveaway-aware result counting.

### 7. Personas

Start with the five existing personas unchanged (`src/opponents/personas.ts`);
only `endgamePieces` is moot in giveaway. Then verify with self-play that the
ladder still holds — kitten < hare < fox < owl < raven by win rate. If it does
not, `personas.ts` gains a per-variant table. Do not pre-emptively split it:
one table that works is better than two that drift.

### 8. State, preferences and startup

- `GameSetup` (`src/state/gameReducer.ts:46`) gains `readonly variant: Variant`.
- `GamePrefs` (`src/state/preferences.ts`) gains `variant`, sanitised
  field-by-field like the others, so an unknown stored value falls back to
  checkers rather than throwing.
- `startFromQuery` (`src/state/startup.ts`) accepts `?game=giveaway` beside the
  existing `?pos=`, `?vs=`, `?side=` and `?db=off`, so a giveaway position can
  be tried by hand.
- `ThinkRequest` (`src/opponents/think.ts:19`) carries the variant; the worker
  is otherwise unchanged.

### 9. UI

- **NavBar** — `giveaway` leaves the `upcoming` list (`src/ui/NavBar.tsx:7`).
  Both tabs become real controls; the current one keeps `aria-current="page"`.
  Clicking Поддавки **opens the New Game dialog preset to that variant** rather
  than switching silently: it needs no confirmation dialog, it reuses UI that
  already exists, and it lets the player choose opponent, colour and clock for
  the new game in one step. Уголки stays disabled.
- **New Game dialog** — unchanged. It sets up a game of whichever variant is
  active; no new row.
- **Result and banter** — result strings are variant-neutral («Победа белых»)
  and need nothing. The remarks in `src/ui/banter.ts` do: `feast: 'Вкусно!'`
  after a big capture is the wrong sentiment in Поддавки, where taking a pile
  of pieces is bad news. Banter becomes variant-aware, with new strings in
  `ru.ts`.
- **Advantage chart** — `Point.advantage` (`src/state/stats.ts:141`) stays raw
  material difference; `AdvantageChart` negates it in giveaway so that "up"
  keeps meaning "winning" on both screens.

## Testing Strategy

Vitest, tests beside their subject, same as the rest of the repo.

1. **Movegen parity (the load-bearing test).** The variant changes no move.
   Assert it rather than assume it: run `perft` for both variants from the
   opening and from the fixtures in `src/engine/testdata/`, and require
   identical node counts. One test that makes an entire class of regressions
   impossible.
2. **Terminal conditions.** `statusOf` and `gameStatus` over positions with no
   pieces and with all pieces blocked, both colours, both variants, plus the
   loss-before-draw ordering at `plies === 30`.
3. **Search.** Giveaway mate-in-N positions (forced self-block and forced
   self-capture sequences), asserting both the score band and the move.
4. **TT isolation.** The same position stored under one variant must not be
   returned under the other.
5. **Evaluation.** Bounds (`|score| < EVAL_MAX` at maximum material), and
   mirror antisymmetry: `evaluateGiveaway(mirror(p)) === -evaluateGiveaway(p)`,
   the invariant `eval.test.ts` already checks for checkers.
6. **State and UI.** Prefs round-trip with the variant, `?game=giveaway`
   parsing including a malformed value, the navbar tab opening the dialog, and
   a full giveaway game played to a win through the reducer.
7. **Strength, measured not asserted.** `npm run selfplay` results are recorded
   in the task notes: giveaway evaluation vs negated-checkers baseline, and the
   persona ladder. These are measurements, not unit tests, and they gate the
   tuning task rather than CI.

Coverage: `npm run test:coverage` should not fall below its current level.
`npm run check` must pass before anything is committed.

## Boundaries

**Always**

- Run `npm run check` before every commit.
- Take engine timings from `npm run bench` only, never from vitest.
- Keep user-visible Russian text in `src/i18n/ru.ts`.
- Pass the variant explicitly; no default parameter value anywhere in the
  rules, status or search path.
- Update this spec first when a decision in it turns out to be wrong.

**Ask first**

- Adding any dependency.
- Changing the checkers evaluation, search behaviour or persona limits in a way
  that affects existing checkers play.
- Splitting `personas.ts` into per-variant tables.
- Touching `dbgen/` or the shipped endgame tables.
- Changing the shape of persisted `localStorage` preferences in a way older
  stored values cannot survive.

**Never**

- Let a giveaway search read the checkers endgame tables.
- Duplicate the search or move generator per variant.
- Delete or skip a failing test to make the gate pass.
- Commit tuning weights that self-play has not measured.

## Success Criteria

1. `RULES.md` documents Поддавки; this spec and the plan are in the repo.
2. The Поддавки navbar tab is live and starts a giveaway game.
3. Perft is identical between variants on every fixture — move generation is
   provably shared.
4. A player with no pieces, and a player whose pieces are all blocked, both win
   in Поддавки and both lose in checkers, at every layer from `statusOf` to the
   result dialog.
5. All five personas play Поддавки, with no endgame-table probe reachable and
   no table fetched in a giveaway-only session.
6. The giveaway evaluation beats the negated-checkers baseline by a margin
   clearly outside noise over ≥200 self-play games. **Met: 57.0% over 400
   games (226–4–170) on a held-out seed, against a standard error of 2.5%.**
7. The persona ladder holds in Поддавки: each persona beats the one below it
   over a self-play match, same as in checkers.
8. `npm run bench` shows no regression in the checkers search.
9. The variant survives a reload through preferences, and `?game=giveaway`
   works.
10. `npm run check` passes; coverage has not dropped.

## Open Questions

1. **King sign in the giveaway evaluation.** Asset or liability, and by how
   much? Deliberately left to self-play. Flagged here because it is the single
   biggest unknown, and because if it turns out that kings are a heavy
   liability, avoiding promotion may deserve its own search-level treatment
   rather than an evaluation term.
2. **Mobility term cost.** A leaf move count may be too expensive for the depth
   it buys. Ships behind a weight, decided by `npm run bench` and self-play.
3. **Switching tabs during a live game.** The design opens the New Game dialog,
   so the running game survives a cancel. Whether an unfinished game should
   instead be kept per variant and restored on switching back is a nicer
   behaviour and a larger one; noted, not planned.
4. **Уголки.** Out of scope, but the variant plumbing built here is what it
   would also use. Worth a look at the seams when the plan is written, without
   building for it.
