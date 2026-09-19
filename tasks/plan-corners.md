# Plan: Уголки

Implementation plan for `tasks/spec-corners.md`. Five stages; every stage
leaves `npm run check` green.

## Dependency order

```
1 docs ──→ 2 engine ──→ 3 game layer + state + opponents ──→ 4 UI ──→ 5 tuning + docs
```

Stage 2 is self-contained: `src/corners/` compiles and is tested before
anything else knows it exists. Stage 3 threads the variant through the
layers above and makes the personas play it; stage 4 makes it reachable.

## Stages

**1 — Documentation.** Spec, this plan, the task list, the Уголки section in
`RULES.md`. The поддавки task files are renamed `*-giveaway.md` so the two
sets do not read as one.

**2 — Engine.** `src/corners/`: board and homes, literal, generator with a
reference to test against, terminal rules, evaluation with placeholder
weights, transposition table, search. Bench section.

**3 — Game layer, state, opponents.** `Position.ply`; `initialPosition` and
`legalMoves` take the variant; `gameStatus` dispatches; `think` searches
the game the request names; the worker keeps the tables for checkers only;
prefs and `?game=corners`; `selfplay variant=corners`.

**4 — UI.** Live tab, homes on the board, chain notation, result reasons
and statistics, chart in squares, banter, strings.

**5 — Tuning and docs.** Self-play for the weights and the ladder, README.

## Risks

| Risk                                         | Mitigation                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Search too shallow to plan a jump chain      | Measured with `npm run bench`; the generator is the hot spot and is a walk    |
| A man left behind, the classic Halma blunder | Straggler term in the evaluation; self-play checks it                         |
| The reducer's capture entry misreads a chain | One path per destination, so a tap on the final square always plays the move  |
| Checkers touched by accident                 | Nothing in `src/engine/` changes but the shared score bands and a hash helper |
| Persona ladder collapses at уголки           | Measured in stage 5; `personas.ts` splits per game only if it does            |

## Verification checkpoints

- After 2: the generator matches the reference on 2 000 random positions; a
  forced finish is found; `npm run bench` prints the corners section.
- After 3: a game of уголки plays to an end through the reducer against a
  persona in the tests.
- After 4: a game played end to end in the browser.
- After 5: self-play tables in `tasks/todo-corners.md`.
