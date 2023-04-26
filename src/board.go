package src

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

type Board struct {
	U, V uint64
}

func NewBoard() Board {
	return Board{49085340525, 160842843832320}
}

func (b Board) Bits() (uint64, uint64) {
	return b.U, b.V
}

func (b Board) BitsString() string {
	w := 'w'
	if b.IsBlackTurn() {
		w = 'b'
	}
	return fmt.Sprintf(`%c               g5 e5 c5 a5 h6 f6 d6 b6 g7 e7 c7 a7 h8 f8 d8 b8
%064v

%-4v            g1 e1 c1 a1 h2 f2 d2 b2 g3 e3 c3 a3 h4 f4 d4 b4
%064v`, w, strconv.FormatUint(b.U, 2), b.OnlyKingMoves(), strconv.FormatUint(b.V, 2))
}

func (b Board) String() string {
	out := strings.Builder{}
	out.WriteString("  a b c d e f g h\n8")
	for i := 0; i < 64; i++ {
		if i%8 == 0 && i != 0 {
			out.WriteString(fmt.Sprintf(" %v\n%v", 9-i/8, 8-i/8))
		}
		x, y := i%8, int(math.Floor(float64(i/8)))
		if (y%2 == 0 && x%2 == 1) || (y%2 == 1 && x%2 == 0) {
			k := b.Get(Pos(math.Floor(float64(i / 2))))
			switch k {
			case Empty:
				out.WriteString(" .")
			case WhiteMan:
				out.WriteString(" o")
			case BlackMan:
				out.WriteString(" x")
			case WhiteKing:
				out.WriteString(" O")
			case BlackKing:
				out.WriteString(" X")
			default:
				out.WriteString(" ?")
			}
		} else {
			out.WriteString("  ")
		}
	}
	out.WriteString(" 1\n  a b c d e f g h  ")
	return out.String()
}

func (b Board) Get(i Pos) Piece {
	if i < 0 || i > 31 {
		panic(fmt.Sprintf("invalid position %v", i))
	}
	if i < 16 {
		return (b.U >> (i * 3)) & 0b111
	} else {
		j := i - 16
		return (b.V >> (j * 3)) & 0b111
	}
}

func (b Board) Set(i Pos, c Piece) Board {
	if i < 0 || i > 31 {
		panic("invalid position")
	}
	if i < 16 {
		mask := ^(uint64(0b111) << (i * 3))
		b.U &= mask // Clear the bits.
		b.U |= c << (i * 3)
	} else {
		j := i - 16
		mask := ^(uint64(0b111) << (j * 3))
		b.V &= mask // Clear the bits.
		b.V |= c << (j * 3)
	}
	return b
}

// OnlyKingMoves returns the number of moves that only involve kings.
// If an eat move was done, then this will return 0.
// If a man move was done, then this will return 0.
func (b Board) OnlyKingMoves() int {
	return int(b.V >> 59)
}

// inc increments the number of moves that only involve kings.
func (b Board) inc() Board {
	b.V += 1 << 59
	return b
}

// SetOnlyKingMoves sets the number of moves that only involve kings.
func (b Board) SetOnlyKingMoves(n int) Board {
	if n < 0 || n > 30 {
		panic(fmt.Sprintf("invalid number of only king moves %v", n))
	}
	mask := ^(uint64(0b11111) << 59)
	b.V &= mask // Clear the bits.
	b.V |= uint64(n) << 59
	return b
}

// Zero set OnlyKingMoves to 0.
func (b Board) Zero() Board {
	b.V &= ^(uint64(0b11111) << 59)
	return b
}

// IsDraw returns true if the game is a draw by checking number of only king moves.
func (b Board) IsDraw() bool {
	return b.OnlyKingMoves() > 30
}

func (b Board) Turn(kingMove bool) Board {
	b.U ^= 1 << 63
	if kingMove {
		return b.inc()
	}
	return b.Zero()
}

func (b Board) Transpose() Board {
	t := Board{}
	for i := 31; i >= 0; i-- {
		switch b.Get(Pos(i)) {
		case Empty:
			t = t.Set(Pos(31-i), Empty)
		case WhiteMan:
			t = t.Set(Pos(31-i), BlackMan)
		case BlackMan:
			t = t.Set(Pos(31-i), WhiteMan)
		case WhiteKing:
			t = t.Set(Pos(31-i), BlackKing)
		case BlackKing:
			t = t.Set(Pos(31-i), WhiteKing)
		default:
			panic("invalid piece")
		}
	}
	if b.IsWhiteTurn() {
		t = t.Turn(false)
	}
	t = t.SetOnlyKingMoves(b.OnlyKingMoves())
	return t
}

// TurnString returns a string representation of the current turn.
func (b Board) TurnString() string {
	if b.IsWhiteTurn() {
		return "white"
	} else {
		return "black"
	}
}

func (b Board) IsWhiteTurn() bool {
	return b.U&(1<<63) == 0
}

func (b Board) IsBlackTurn() bool {
	return b.U&(1<<63) != 0
}

func (b Board) IsEnemy(at Pos) bool {
	if b.IsWhiteTurn() {
		return IsBlack(b.Get(at))
	} else {
		return IsWhite(b.Get(at))
	}
}

func (b Board) IsEmpty(at Pos) bool {
	return b.Get(at) == Empty
}

func (b Board) GenerateMoveName(target Board) string {
	move := Move{Board: b}
	for _, m := range move.allMoves() {
		if m.Board == target {
			return m.Name
		}
	}
	panic("move not found")
}

func (b Board) Marshal() string {
	return fmt.Sprintf("Board{U: %v, V: %v}", b.U, b.V)
}
