package src_test

import (
	"testing"

	. "checkers/src"
	"github.com/stretchr/testify/assert"
)

func BenchmarkBoard_GenerateMoveName(b *testing.B) {
	board := Board{}.
		Set(Parse("f6"), WhiteMan).
		Set(Parse("c3"), WhiteKing)
	for i := 0; i < b.N; i++ {
		board.GenerateMoveName(board.Turn(false).Set(Parse("f6"), Empty).Set(Parse("e7"), WhiteMan))
	}
}

func TestNames_GenerateMoveName(t *testing.T) {
	b := Board{}.
		Set(8, WhiteMan).
		Set(5, BlackMan).
		Set(10, BlackMan)
	moves := b.AllMoves()
	assert.Len(t, moves, 2)
	assert.Equal(t, "b6:d8:g5", b.GenerateMoveName(moves[0]))
	assert.Equal(t, "b6:d8:h4", b.GenerateMoveName(moves[1]))
}
