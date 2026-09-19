# Damka

Russian checkers (шашки), поддавки and уголки in the browser: two engines,
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
- Уголки, the race across the board: nine men a side, steps and jump
  chains on all 64 squares, and its own mailbox engine
- Alpha-beta search with iterative deepening, transposition table, and capture search, running in a Web Worker
- Endgame tables for every position with at most five pieces, 10 MB in all

## Layout

```
src/engine/     Checkers engine, shared by шашки and поддавки: bitboards, search, endgame tables
src/corners/    Уголки engine: mailbox board, generator, search
src/game/       Rules layer the UI talks to; dispatches on the game being played
src/opponents/  Personas, the search worker, self-play
src/state/      Reducer, clock, history, preferences
src/ui/         React components
```

## References

- [Russian draughts](https://en.wikipedia.org/wiki/Russian_draughts)
- [Поддавки](https://ru.wikipedia.org/wiki/Поддавки)
- [Уголки](<https://ru.wikipedia.org/wiki/Уголки_(игра)>)

# License

[MIT](LICENSE)
