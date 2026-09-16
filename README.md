# Damka

Russian checkers (шашки) in the browser: a bitboard engine, an alpha-beta
search in a worker, and five computer opponents.

### [Play the game](https://antonmedv.github.io/damka/)

## Features

- Russian checkers rules: flying kings, mandatory captures, the 30-ply
  draw
- Alpha-beta search (negamax with principal variation search, iterative
  deepening, aspiration windows, a transposition table, and a quiescence
  search over the forced captures), off the main thread in a Web Worker
- Five opponents, from the kitten to the raven; the evaluation is the
  same for all of them, and only the search depth, the time budget and
  the allowed distance from the best move differ
- Or play both sides against a friend
- Move list, clocks, advantage chart, drag or click to move, sound
- Installable as a PWA; the interface is in Russian

## Development

```sh
npm install
npm run dev        # Vite dev server
npm run check      # typecheck, lint, format, tests
npm run bench      # engine benchmarks (bundled, not under vitest)
npm run selfplay   # personas against each other
```

## References

- [Russian draughts](https://en.wikipedia.org/wiki/Russian_draughts)
- The earlier Go implementation, with an endgame database and a neural
  network evaluation, lives on the
  [go-version](https://github.com/antonmedv/damka/tree/go-version) branch
