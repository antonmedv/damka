# Russian Checkers Rules

## Board

- 8×8 board; only dark squares are used.
- Each player starts with 12 men.
- White occupies rows 1–3 and moves toward row 8.
- Black occupies rows 6–8 and moves toward row 1.
- Rows 4–5 start empty.
- White moves first.

## Pieces

### Man

- Moves one square diagonally forward.
- Captures diagonally forward or backward.

### King

- Moves diagonally forward or backward across any number of empty squares.

## Captures

Capturing is **mandatory**.

If multiple complete capture sequences are available, the player may choose **any** of them.

There is no requirement to:

- capture the maximum number of pieces;
- prefer kings;
- prefer any particular capture sequence.

### Man Capture

A man captures by jumping over an adjacent enemy piece onto the empty square immediately behind it.

If another capture is available from the landing square, the same piece must continue capturing.

### King Capture

A king may capture the first enemy piece encountered on a diagonal if:

- all squares before it are empty;
- at least one empty square exists behind it.

The king may land on any empty square after the captured piece, up to the next occupied square or board edge.

If a further capture is possible from some of those squares, the king must land on one of them (it may not stop on a square from which no capture is possible while another landing square offers one). Which of them is the player's choice.

If another capture is available, the king must continue.

After each capture, it may change diagonal direction.

### Multiple Captures

During one capture sequence:

- the same piece performs all captures;
- continuation is mandatory while another capture exists;
- the same enemy piece cannot be captured twice;
- the same empty square may be visited more than once;
- captured pieces remain on the board until the complete sequence ends;
- already captured pieces therefore still block movement during the sequence.

After the complete move finishes, all captured pieces are removed.

## Promotion

A man becomes a king when it reaches the opponent's back row.

### Normal Move

If a man reaches the back row with a normal move, the move ends and it becomes a king.

### During Capture

If a man reaches the back row during a capture sequence, it becomes a king **immediately**.

If another capture is available, it continues the same move using king capture rules.

## Winning

A player loses if, at the start of their turn:

- they have no pieces; or
- they have no legal moves.

## Draws

Official Russian checkers includes several draw rules involving:

- repeated positions;
- king-only move limits;
- specific endgame material combinations;
- special 5-, 15-, 30-, and 60-move limits.

For this game, these are intentionally replaced with one simpler rule.

### Simplified Draw Rule

The game is a draw after **30 consecutive plies** in which only kings make non-capturing moves.

Reset the counter to `0` whenever:

- a capture occurs; or
- a man moves.

Otherwise:

```text
drawCounter += 1
```

The game is drawn when:

```text
drawCounter >= 30
```

A promotion resets the counter because the moving piece was a man.

No other official draw conditions are implemented.

# Поддавки

Поддавки (Russian giveaway checkers) is played with every rule above
unchanged — the same board, the same men and kings, the same mandatory
captures with a free choice among complete sequences, the same flying
kings, the same promotion — and one difference.

## Winning

A player **wins** if, at the start of their turn:

- they have no pieces; or
- they have no legal moves.

This is the exact inverse of the rule for checkers, and it is the whole of
the variant. Move generation is identical, which is why both games share
one generator.

## Draws

The simplified draw rule is unchanged: a draw after 30 consecutive plies in
which only kings make non-capturing moves.

As in checkers, the loss-before-draw ordering holds: a side with no legal
move has already won when its turn begins, even on the 30th quiet king ply.

# Уголки

Уголки (Russian corners) is a different game on the same board: a race,
not a fight. Nothing is ever captured, there are no kings, and every square
of the board is in play, light ones included.

## Board

- 8×8 board; all 64 squares are used.
- Each player has 9 men, set up in a 3×3 corner called the player's
  **home**: White on a1–c3, Black on f6–h8.
- White moves first.
- A player's **target** is the opponent's home.

## Moves

One man moves per turn, in one of two ways:

- **Step**: to an adjacent empty square, left, right, up or down. Never
  diagonally.
- **Jump**: over an adjacent man of either colour, in a straight line left,
  right, up or down, onto the empty square directly beyond it. From the
  landing square the same man may jump again, in any of the four
  directions, as many times as there are jumps to make.

The player chooses where a chain of jumps ends: stopping after any landing
square is allowed. A man may not end its move where it started. Jumped men
stay where they are; nothing is captured.

This is the "classical" game of the Russian tradition. The diagonal
variant, in which men also step and jump diagonally, is not played here.

## Winning

The player who first has all nine men in the target wins.

White moves first, so Black gets one answer: if White fills the target and
Black fills its own target with the very next move, the game is a **draw**.

## Blocking

A man left at home forever would keep the opponent from ever finishing, so
the game does not allow it:

- Once both players have made 40 moves, a player who has a man in their
  own home **loses**. Moving a man back into one's own home after that
  point loses in the same way. If both have men at home at that moment,
  the game is a draw.
- Once both players have made 80 moves and nobody has won, the game ends:
  the player with more men in the target wins, and an equal count is a
  draw.
- A player with no legal move loses. This is possible in principle and
  never happens in practice.

Both limits are counted from the position the game started from.

## Notation

`a3-a4` is a step. A chain of jumps lists every landing square:
`a1-a3-c3`.
