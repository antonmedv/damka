package src_test

import (
	"testing"

	. "checkers/src"
	"github.com/stretchr/testify/assert"
)

func BenchmarkBoard_AllMoves(b *testing.B) {
	board := Board{}.
		Set(Parse("f6"), WhiteMan).
		Set(Parse("c3"), WhiteKing)
	for i := 0; i < b.N; i++ {
		board.AllMoves()
	}
}

func TestBoard_AllMoves_Man(t *testing.T) {
	b := NewBoard()
	assert.Len(t, b.AllMoves(), 7)
	assert.Len(t, b.Turn(false).AllMoves(), 7)
}

func TestBoard_AllMoves_Man_to_King(t *testing.T) {
	b := Board{}.
		Set(4, WhiteMan)
	assert.Equal(t, WhiteKing, b.AllMoves()[0].Get(0))
	b = Board{}.
		Turn(false).
		Set(27, BlackMan)
	assert.Equal(t, BlackKing, b.AllMoves()[0].Get(31))
}

func TestBoard_AllMoves_King(t *testing.T) {
	b := Board{}.
		Set(Parse("d4"), WhiteKing)
	assert.Len(t, b.AllMoves(), 13)
	assert.Len(t, b.Turn(false).AllMoves(), 0)
}

func TestBoard_AllMoves_King_Main_Diagonal(t *testing.T) {
	b := Board{}.
		Set(Parse("a1"), WhiteKing)
	moves := b.AllMoves()
	assert.Len(t, moves, 7)
	assert.Len(t, b.Turn(false).AllMoves(), 0)
}

func TestBoard_AllMoves_Man_Eats_And_Becomes_King(t *testing.T) {
	b := Board{}.
		Set(8, WhiteMan).
		Set(5, BlackMan).
		Set(10, BlackMan)
	moves := b.AllMoves()
	assert.Len(t, moves, 2)
	assert.Equal(t, WhiteKing, moves[0].Get(15))
	assert.Equal(t, WhiteKing, moves[1].Get(19))
}

func TestBoard_AllMoves_5Bear(t *testing.T) {
	//   a b c d e f g h
	// 8   .   .   .   . 8
	// 7 .   .   .   .   7
	// 6   .   .   .   . 6
	// 5 .   x   x   .   5
	// 4   .   .   .   . 4
	// 3 .   x   x   x   3
	// 2   .   o   .   . 2
	// 1 .   .   .   .   1
	//   a b c d e f g h
	b := Board{}.
		Set(25, WhiteMan).
		Set(21, BlackMan).
		Set(13, BlackMan).
		Set(14, BlackMan).
		Set(22, BlackMan).
		Set(23, BlackMan)
	moves := b.AllMoves()
	assert.Len(t, moves, 4)
}

func TestBoard_AllMoves_Bug1(t *testing.T) {
	{
		b := Board{}.
			Set(4, WhiteKing).
			Set(13, WhiteMan).
			Set(17, BlackKing).
			Turn(false)
		moves := b.AllMoves()
		assert.Equal(t, 1, len(moves))
		assert.Equal(t, "d4:b6", b.GenerateMoveName(moves[0]))
	}
	{
		b := Board{}.
			Set(4, WhiteKing).
			Set(13, WhiteMan).
			Set(17, BlackMan).
			Turn(false)
		moves := b.AllMoves()
		assert.Equal(t, 1, len(moves))
		assert.Equal(t, "d4:b6", b.GenerateMoveName(moves[0]))
	}
}

func TestBoard_AllMoves_Bug2(t *testing.T) {
	b := Board{}.
		Set(20, WhiteMan).
		Set(24, BlackMan)
	moves := b.AllMoves()
	assert.Equal(t, 1, len(moves))
	assert.Equal(t, "a3:c1", b.GenerateMoveName(moves[0]))
	assert.Equal(t, WhiteMan, moves[0].Get(29))
}

func TestBoard_AllMoves_Bug3(t *testing.T) {
	//    a b c d e f g h
	//  8   .   .   .   . 8
	//  7 .   .   .   .   7
	//  6   .   .   .   . 6
	//  5 .   .   .   .   5
	//  4   .   .   O   . 4
	//  3 .   O   .  .    3
	//  2   .   .   .   O 2
	//  1 X   .   .   .   1
	//    a b c d e f g h
	b := Board{}.
		Set(Parse("a1"), X).
		Set(Parse("c3"), O).
		Set(Parse("f4"), O).
		Set(Parse("h2"), O).
		Turn(false)
	moves := b.AllMoves()
	assert.Equal(t, 1, len(moves))
	assert.Equal(t, "a1:e5:g3", b.GenerateMoveName(moves[0]))
	assert.Equal(t, BlackKing, moves[0].Get(Parse("g3")))

	//   a b c d e f g h
	// 8   .   .   .   . 8
	// 7 .   .   x   .   7
	// 6   .   .   .   . 6
	// 5 .   .   x   x   5
	// 4   .   .   .   . 4
	// 3 .   .   .   .   3
	// 2   .   .   .   . 2
	// 1 O   .   .   .   1
	//   a b c d e f g h
	b = Board{}.
		Set(28, WhiteKing).
		Set(14, BlackMan).
		Set(6, BlackMan).
		Set(15, BlackMan)
	moves = b.AllMoves()
	assert.Equal(t, 2, len(moves))
	assert.Equal(t, "a1:f6:d8", b.GenerateMoveName(moves[0]))
	assert.Equal(t, "a1:f6:h4", b.GenerateMoveName(moves[1]))
}
