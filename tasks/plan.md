# Plan: Поддавки

Implementation plan for `tasks/spec-giveaway.md`. Eight stages, each one a
commit that leaves `npm run check` green.

## Dependency order

```
1 docs ──→ 2 engine rules ──→ 3 giveaway eval ──→ 4 move ordering
                   │                  │
                   └──→ 5 opponents ───┴──→ 7 UI ──→ 8 tuning + docs
                              │
                              └──→ 6 state
```

Stage 2 is the spine: everything else waits on the variant existing in the
engine. Stages 3/4 (playing strength) and 5/6/7 (making it reachable) are
independent of each other once 2 lands.

## Stages

**1 — Documentation.** Spec, this plan, the task list, and the Поддавки
section in `RULES.md`. No code.

**2 — Engine rules.** `variant.ts`, the terminal condition, `matingScore`, the
TT meta word, and the variant threaded through `search`. Giveaway plays here,
using the negated checkers evaluation as a deliberate baseline — that baseline
is what stage 3 has to beat, so it is worth having in the history.

**3 — Giveaway evaluation.** `evalGiveaway.ts` with its own term set and
tables. Weights are placeholders until stage 8 measures them.

**4 — Move ordering.** Giveaway inverts the capture-ordering heuristic.
Speed only; correctness cannot move. Measured with `npm run bench`.

**5 — Opponents.** `ThinkRequest` carries the variant, the worker stops
fetching tables for giveaway, `dbLimit(0)` blocks the probe, and `selfplay`
learns `variant=`.

**6 — State.** `GameSetup`, `GamePrefs`, `?game=giveaway`.

**7 — UI.** The navbar tab goes live and opens the New Game dialog preset to
the variant; banter and the advantage chart become variant-aware; new Russian
strings.

**8 — Tuning and docs.** Run the self-play matches, freeze the weights, record
the numbers, update the README.

## Risks

| Risk                                           | Mitigation                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Giveaway eval never beats the negated baseline | The baseline is itself playable and stays in the history; worst case the feature ships on it and tuning continues |
| Mobility term too slow for the depth it buys   | Ships behind a weight that self-play can zero; `npm run bench` decides                                            |
| Cross-variant TT contamination                 | Variant in the meta word (stage 2), with a test that stores under one variant and probes under the other          |
| Persona ladder collapses in giveaway           | Measured in stage 8; `personas.ts` splits per variant only if it does                                             |
| A default variant argument hides a scoring bug | No defaults anywhere on the rules path; the compiler enforces every call site                                     |

## Verification checkpoints

- After 2: a giveaway mate-in-N is found; checkers tests unchanged; `npm run bench` flat.
- After 4: `npm run bench` for both variants recorded.
- After 7: a giveaway game played end to end in the browser.
- After 8: self-play tables in `tasks/todo.md`.
