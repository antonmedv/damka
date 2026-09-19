# Tasks: Уголки

## Stage 1 — Documentation

- [x] Spec, plan, task list, `RULES.md` section; поддавки task files renamed
  - Files: `tasks/spec-corners.md`, `tasks/plan-corners.md`, `tasks/todo-corners.md`, `RULES.md`

## Stage 2 — Engine

- [x] `corners/board.ts`: squares, homes, distances, opening, ASCII board
- [x] `corners/position.ts`: literal in and out of the UI `Position`
- [x] `corners/movegen.ts`: packed moves for the search, `Move`s with paths for the UI; reference generator in the tests
  - Verify: `src/corners/movegen.test.ts` — 2 000 random placements and 300 plies of a random game agree with the reference
- [x] `corners/status.ts`: finish, Black's answer, the 80- and 160-ply limits, no moves
- [x] `corners/eval.ts`: distance costs, straggler, tempo; `weights` for self-play
- [x] `corners/tt.ts`: exact-match table on four words and meta
- [x] `corners/search.ts`: PVS with iterative deepening and the checkers root layout
  - Verify: `src/corners/search.test.ts` — a finish through a six-jump chain, Black's answer read as a draw, the home deadline
- [x] Bench section: `npm run bench -- corners`

## Stage 3 — Game layer, state, opponents

- [x] `Position.ply`; `initialPosition(variant)`; `legalMoves(position, variant)`; `gameStatus` dispatch; `formatMove` chains
- [x] `think` searches the requested game; worker fetches tables for checkers only
  - Also: `pickRoot` plays a found win the shortest way. Without it the fox
    shuffled inside a filled target between a finish in three and a finish
    in four, both within its margin, for as long as the dice said so
- [x] Prefs, `?game=corners`, `?pos=` in the corners literal
- [x] `selfplay variant=corners`

## Stage 4 — UI

- [x] NavBar tab live, «скоро» gone
- [x] Board homes
- [x] Result reasons and rows; chart in squares
- [x] Banter; strings

## Stage 5 — Tuning and docs

- [x] Self-play: weights, ladder — recorded below; `inside` moved from 10 to 20
- [x] README

## Measurements

### Search speed

`npm run bench -- corners`, on the opening and two positions along a random
game, each loaded once outside the timing. (The first figures recorded
here, 362 and 171 ns, had the load inside the timed call and were about
twice too high.)

| benchmark | opening | midgame | late |
| --------- | ------: | ------: | ---: |
| generate  |     141 |     158 |  211 |
| evaluate  |      38 |      38 |   38 |
| status    |      14 |      14 |   14 |

One second per fixture, depth reached, Mnode/s and table hit rate:
opening 9 / 6.4 / 43%, midgame 9 / 6.6 / 45%, late 8 / 6.8 / 48%. Most
nodes are leaves, which is why the rate is above what the generator alone
would allow. A node costs about 150 ns, of which the status check is 14;
counters kept in make/unmake would save perhaps 9 of them, not worth the
state.

### Persona ladder

20 games per pairing at `scale=0.05` with four random opening plies, side
A first:

| Pairing        | Result | Score |
| -------------- | ------ | ----: |
| raven vs owl   | 11–3–6 | 62.5% |
| owl vs fox     | 10–4–6 | 60.0% |
| fox vs hare    | 14–2–4 | 75.0% |
| hare vs kitten | 19–0–1 | 97.5% |

The ladder holds at every rung. Twenty games say little about the size of
the top gaps, but nothing is inverted.

### Evaluation weights

`owl vs owl`, 100 games at `scale=0.02`, seed 3, four random opening plies,
side A on the shipped weights `step,inside,straggler,tempo = 100,10,50,5`
and side B on one change. The standard error of a score is about 5%.

| Side B        | Result   | Score of A |
| ------------- | -------- | ---------: |
| inside 0      | 76–8–16  |      80.0% |
| straggler 0   | 63–13–24 |      69.5% |
| straggler 100 | 43–14–43 |      50.0% |
| tempo 0       | 37–15–48 |      44.5% |

What the numbers say:

- The inside term is the evaluation's spine. Without it the men entering
  the target stop at the entrance and block the rest; the position looks
  finished to the sum and is not.
- The straggler term earns its place, and 50 against 100 is a plateau.
- Tempo looked like it might be hurting, one standard error from even, so
  it was measured again; see below.

### Tempo, again

The same match at seed 7 over 200 games: **92–27–81, 52.8%** for tempo 5.
Over the 300 games of both runs the two sides stand at 129–42–129, which is
even to the game. Tempo earns nothing here and costs nothing; 5 ships for
the same reason it does at checkers, to damp the odd/even swing between
iterations, not because the games can tell.

### Inside weight

`inside` was the term that mattered most, so 20 was tried against the
first guess of 10:

| Seed | Games | Result for 10 | Score of 20 |
| ---- | ----: | ------------- | ----------: |
| 5    |   100 | 41–11–48      |       53.5% |
| 11   |   200 | 71–34–95      |       56.0% |

Over the 300 games 20 scores **55.2%**, 1.8 standard errors clear of even,
so **20 ships**: `step,inside,straggler,tempo = 100,20,50,5`. The rest of
the tables above were measured with 10 and are not re-run: none of them
was close, and the inside weight changes what the entrance is worth, not
what the other terms do.
