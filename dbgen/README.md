# dbgen

The endgame database generator for Damka. Go, no dependencies.

```
go test ./...                       # movegen against the engine's perft counts
go run . stats -max 5               # index slots per slice, before solving
go run . solve -max 5 -check        # solve and verify
go run . solve -max 5 -out ../public/db
```

## What is stored

One byte per position, always with white to move; a black-to-move
position is mirrored (the board turned 180 degrees and the colours
swapped), which halves the database.

```
0        draw whatever the draw counter says
1..30    win, needs a counter budget of at least this many plies
32..62   loss, the budget it needs is the value minus 32
```

The budget is `30 - plies`, the quiet king plies RULES.md still allows
before the game is drawn. So the table answers the rule exactly at any
counter state, and the value doubles as a distance to the next capture or
man move, which is what the engine needs to make progress instead of
shuffling kings. Both the win and the loss set grow with the budget, so
one threshold per position is enough.

## How it is solved

Slices (material classes) are solved with fewer pieces first, then fewer
men: a capture leaves a slice downwards and a promotion turns a man into
a king. Inside a slice and its mirror, positions are grouped by man
placement, ordered by how far the men have advanced, because a quiet man
move only ever goes forward. Within one group every move that stays
inside is a quiet king move and every move that leaves it resets the
counter into a table that is already final, so a single sweep over the
budgets 0..30 finishes the group. That needs one move generation per
position and no unmove generator.

## What is shipped

`-out` writes one file per slice plus `manifest.json`. A slice file is a
header, a block offset table and the blocks; each block is raw deflate
over 2^blockShift positions, so a probe inflates a few kilobytes and
keeps them in a cache.

Positions that are never probed - holes in the fixed-stride index, and
nodes where the side to move has a capture, which the search resolves
itself - are don't-cares, filled with the value before them so they
lengthen runs instead of costing bytes. For five pieces that is 59.6% of
the index space.
