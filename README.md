# Damka

Russian checkers (шашки) and поддавки in the browser: a bitboard engine,
an alpha-beta search in a worker, and five computer opponents.

### [Play the game](https://antonmedv.github.io/damka/)

**Game**:

<a href="https://antonmedv.github.io/damka/"><img src=".github/images/screenshot.png" width="800"></a>

**Training**:

<a href="https://antonmedv.github.io/damka/"><img src=".github/images/demo.gif" width="400"></a>

## Features

- Russian checkers rules: flying kings, mandatory captures, and the 30-ply draw
- Поддавки on the same rules with the objective inverted: the player who
  cannot move wins. One move generator serves both games
- Alpha-beta search with iterative deepening, transposition table, and capture search, running in a Web Worker
- Endgame tables for every position with at most five pieces, 10 MB in all

## References

- [Russian draughts](https://en.wikipedia.org/wiki/Russian_draughts)
- [Поддавки](https://ru.wikipedia.org/wiki/Поддавки)

# License

[MIT](LICENSE)
