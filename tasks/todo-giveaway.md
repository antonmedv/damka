# Tasks: Поддавки

## Stage 1 — Documentation

- [x] Task: Spec, plan, task list, and the Поддавки section in `RULES.md`
  - Acceptance: `RULES.md` states the inverted winning condition and that every other rule is shared
  - Verify: read it against `tasks/spec-giveaway.md`
  - Files: `tasks/spec-giveaway.md`, `tasks/plan-giveaway.md`, `tasks/todo-giveaway.md`, `RULES.md`

## Stage 2 — Engine rules

- [x] Task: `src/engine/variant.ts` with `CHECKERS`, `GIVEAWAY`, `Variant`
  - Acceptance: an int type, no import cycles
  - Verify: `npm run typecheck`
  - Files: `src/engine/variant.ts`

- [x] Task: Terminal condition takes the variant
  - Acceptance: `statusOf`/`status` require a variant, no default; giveaway is the exact inverse when `moveCount === 0` and identical otherwise
  - Verify: `src/engine/status.test.ts`
  - Files: `src/engine/status.ts`, `src/engine/status.test.ts`

- [x] Task: `matingScore` beside `matedScore`
  - Acceptance: `matingScore(p) === -matedScore(p)`; `isMateScore` unchanged
  - Verify: `src/engine/score.test.ts`
  - Files: `src/engine/score.ts`, `src/engine/score.test.ts`

- [x] Task: Variant in the TT meta word
  - Acceptance: `metaOf(side, plies, variant)`; an entry stored under one variant never matches the other
  - Verify: `src/engine/tt.test.ts`
  - Files: `src/engine/tt.ts`, `src/engine/tt.test.ts`

- [x] Task: Thread the variant through `search`
  - Acceptance: `Limits.variant` required; root and node terminals, leaf evaluation and the DB probe all respect it
  - Verify: `src/engine/search.test.ts` — a giveaway mate-in-N; checkers tests untouched
  - Files: `src/engine/search.ts`, `src/engine/search.test.ts`

- [x] Task: `gameStatus` takes the variant
  - Acceptance: required parameter; movegen untouched
  - Verify: `src/game/moves.test.ts`
  - Files: `src/game/moves.ts`, `src/game/moves.test.ts`

## Stage 3 — Giveaway evaluation

- [x] Task: `src/engine/evalGiveaway.ts`
  - Acceptance: material, advancement and tempo terms; every score strictly inside `EVAL_MAX`; mirror antisymmetry. The edge, back-rank, border and mobility terms were planned and did not survive measurement — see below
  - Verify: `src/engine/evalGiveaway.test.ts`, and `npm run selfplay` against the negated baseline
  - Files: `src/engine/evalGiveaway.ts`, `src/engine/evalGiveaway.test.ts`, `src/opponents/selfplay.ts`

## Stage 4 — Move ordering

- [x] Task: Giveaway capture ordering — **built, measured, dropped**
  - Acceptance: no change to any score, only to node counts
  - Verify: 100 self-play games each way reached 14.25 plies in the same
    time, with the inverted ordering and with the checkers one. No gain, so
    the branch does not carry the extra branch
  - Files: none in the end

## Stage 5 — Opponents

- [x] Task: `ThinkRequest.variant`, endgame tables off in giveaway
  - Acceptance: `dbLimit(0)` in giveaway, no probe, no fetch in a giveaway-only session
  - Verify: `src/opponents/think.test.ts`
  - Files: `src/opponents/think.ts`, `src/opponents/search.worker.ts`, `src/opponents/thinker.ts`

- [x] Task: `selfplay variant=`
  - Acceptance: a giveaway tournament runs and counts results correctly
  - Verify: `npm run selfplay -- games=2 variant=giveaway scale=0.02`
  - Files: `src/opponents/selfplay.ts`

## Stage 6 — State

- [x] Task: Variant in setup, preferences and startup
  - Acceptance: survives a reload; `?game=giveaway` works; a malformed stored value falls back to checkers
  - Verify: `src/state/preferences.test.ts`, `src/state/startup.test.ts`, `src/state/gameReducer.test.ts`
  - Files: `src/state/gameReducer.ts`, `src/state/preferences.ts`, `src/state/startup.ts`

## Stage 7 — UI

- [x] Task: Live navbar tab, variant-aware banter and chart, Russian strings
  - Acceptance: the tab opens the New Game dialog preset to the variant; «Вкусно!» never fires for a big capture in giveaway; the chart reads "up = winning" in both
  - Verify: `src/ui/NavBar.test.tsx`, `src/ui/banter.test.ts`, `src/ui/GameScreen.test.tsx`, `src/App.test.tsx`
  - Files: `src/ui/NavBar.tsx`, `src/ui/Page.tsx`, `src/ui/GameScreen.tsx`, `src/ui/banter.ts`, `src/ui/AdvantageChart.tsx`, `src/i18n/ru.ts`

## Stage 8 — Tuning and docs

- [x] Task: Self-play tuning, frozen weights, README
  - Acceptance: giveaway eval beats the negated baseline over ≥200 games (met: 57.0% over 400 on a held-out seed); the persona ladder holds (met, except that the top rung is unresolved at 60 games)
  - Verify: `npm run selfplay`; numbers recorded below
  - Files: `src/engine/evalGiveaway.ts`, `src/opponents/personas.ts`, `README.md`

## Measurements

### Search speed

`npm run bench`, one second per fixture, depth reached and Mnode/s:

| Fixture | Checkers, before | Checkers, after | Поддавки  |
| ------- | ---------------- | --------------- | --------- |
| initial | 16 / 9.74        | 16 / 10.6       | 21 / 11.4 |
| midgame | 18 / 8.70        | 18 / 9.53       | 18 / 10.4 |
| kings   | 19 / 6.86        | 19 / 7.90       | 23 / 9.02 |
| tactics | 22 / 7.27        | 22 / 8.34       | 22 / 9.16 |

Checkers reaches the same depth: the variant costs it nothing. Read the
depth column, not the rate - the two checkers columns were measured at
different times, and the rate moves 5-17% between runs on an idle machine.
An independent re-run of the same fixtures put master at 8.86 Mnode/s on
`initial` against the branch's 8.40, the other way round from the columns
here and equally meaningless. Поддавки runs deeper, which is what a
cheaper evaluation over a more forcing tree should look like.

### Endgame table downloads

Counted from Chrome's net log against `npm run preview`, one page load each:

| Session opens on | `db/manifest.json` | Slice files                     |
| ---------------- | ------------------ | ------------------------------- |
| Шашки            | fetched            | 41 (the four-piece set, 636 kB) |
| Поддавки         | not fetched        | 0                               |

The поддавки search is forbidden to probe the tables, so it should not pay
for them either. This is easy to regress without noticing, which is why the
number is written down.

### Giveaway evaluation against the negated baseline

All runs are `owl vs owl` at `scale=0.02` with six random opening plies,
side A on the evaluation being tested and side B on the negated checkers
evaluation (`baseline=b`). The two sides never share a transposition table
entry, so every search starts cold; that costs both sides the same, but it
holds the depth reached near 14 rather than the 16–21 a persona gets in a
real game.

Two hand-reasoned sets, 200 games each:

| Weights                                                       | Result   | Score |
| ------------------------------------------------------------- | -------- | ----- |
| kings heavy, small edge and back-rank terms, promotion a risk | 95–4–101 | 48.5% |
| kings light, border 50, promotion a reward                    | 79–7–114 | 41.2% |

Seven-way sweep, 150 games each — standard error 4.1%, so nothing here is
conclusive on its own:

| man,king,border,promotion | Result  | Score |
| ------------------------- | ------- | ----- |
| 100,200,0,1               | 78–1–71 | 52.3% |
| 100,300,25,1              | 77–2–71 | 52.0% |
| 100,200,50,1              | 76–1–73 | 51.0% |
| 100,200,25,0              | 72–3–75 | 49.0% |
| 100,200,25,1              | 71–2–77 | 48.0% |
| 100,140,25,1              | 67–2–81 | 45.3% |
| 100,200,25,-1             | 66–4–80 | 45.3% |

Nine configurations at 400 games, standard error 2.5%, seed 5:

| man,king,border,promotion | Result    | Score     |
| ------------------------- | --------- | --------- |
| 100,400,0,1               | 241–6–153 | **61.0%** |
| 100,600,0,1               | 236–5–159 | 59.6%     |
| 100,300,0,1               | 234–6–160 | 59.2%     |
| 100,800,0,1               | 233–4–163 | 58.8%     |
| 100,400,0,2               | 231–6–163 | 58.5%     |
| 100,450,0,1               | 227–7–166 | 57.6%     |
| 100,500,0,1               | 228–3–169 | 57.4%     |
| 100,400,0,0               | 216–4–180 | 54.5%     |
| 100,300,25,1              | 210–4–186 | 53.0%     |

`100,400,0,1` shipped. Chosen on seed 5, so it was checked again on seed
11: **226–4–170, 57.0%**. The drop from 61.0% is the selection showing, and
57.0% is still 2.8 standard errors clear of even.

What the numbers say, beyond the winner:

- A king should be much the heavier burden, heavier than the three men
  checkers values it at. Every light-king set lost; 300–800 is a plateau.
- The rank term earns its place: promotion 0 costs about six points
  against promotion 1.
- The border term earns nothing and probably costs something, at the same
  king weight (59.2% against 53.0%). The fact it rests on is true and is
  asserted in `movegen.test.ts`; the term is not in the code.

### Tempo sign

Four settings at 400 games each, seed 5, everything else at the shipped
weights and the same `owl vs owl` against the negated baseline:

| tempo | Result    | Score     |
| ----- | --------- | --------- |
| 5     | 241–6–153 | **61.0%** |
| 0     | 238–3–159 | 59.9%     |
| 10    | 227–5–168 | 57.4%     |
| -5    | 210–8–182 | 53.5%     |

Seed 5 is the seed the weights were chosen on, so every row is inflated
by the same selection; the comparison between rows is still paired and
fair.

The sign was worth asking about and the answer is the checkers answer:
having the move is good news here too. A negative tempo costs 7.5 points
against the shipped one, a little over two standard errors of the
difference. The size is another matter — 0 and 5 are 1.1 points apart
against a standard error of 3.5 for the difference — so the term earns
its sign and nothing beyond it. 5 ships because it measured best, not
because the gap means anything.

### Capture ordering

100 games each way, same evaluation on both sides, depth reached at a
fixed budget:

| Ordering              | Depth       |
| --------------------- | ----------- |
| Checkers ordering     | 14.4 / 14.1 |
| Inverted for поддавки | 14.3 / 14.2 |

No gain, so the branch does not carry it.

### Persona ladder at поддавки

60 games per pairing at `scale=0.05`, both sides on the shipped weights:

| Pairing        | Result  | Score |
| -------------- | ------- | ----- |
| raven vs owl   | 30–0–30 | 50.0% |
| owl vs fox     | 40–1–19 | 67.5% |
| fox vs hare    | 52–0–8  | 86.7% |
| hare vs kitten | 54–0–6  | 90.0% |

The ladder holds: nothing is inverted, and the three lower rungs are
decisive. The top rung is not resolved — raven and owl differ only in time
(3000 ms against 1500 ms) once the endgame tables are out of the picture,
and 60 games cannot see a gap that small. That is a reason to measure it
with more games some day, not a reason to split `personas.ts` per variant.
