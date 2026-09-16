# Damka

Russian checkers (шашки) in the browser: a bitboard engine, an alpha-beta
search in a worker, and five computer opponents.

### [Play the game](https://antonmedv.github.io/damka/)

**Game**:

<a href="https://antonmedv.github.io/damka/"><img src=".github/images/screenshot.png" width="800"></a>

**Training**:

<a href="https://antonmedv.github.io/damka/"><img src=".github/images/demo.gif" width="400"></a>

## Features

- Russian checkers rules: flying kings, mandatory captures, and the 30-ply draw
- Alpha-beta search with iterative deepening, transposition table, and capture search, running in a Web Worker
- Endgame tables for every position with at most five pieces, 10 MB in all, fetched as a game reaches them. They answer the 30-ply rule exactly, so a won ending is converted instead of shuffled; [dbgen](dbgen) builds them

## References

- [Russian draughts](https://en.wikipedia.org/wiki/Russian_draughts)
- The earlier Go implementation, with an endgame database and a neural
  network evaluation, lives on the
  [go-version](https://github.com/antonmedv/damka/tree/go-version) branch

# License

[MIT](LICENSE)
