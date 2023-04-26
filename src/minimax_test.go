package src_test

import (
	"math"
	"testing"

	. "checkers/src"
)

func BenchmarkMinimax(b *testing.B) {
	board := NewBoard()
	m := NewMinimax(NetZero, 6, nil)
	alpha := math.Inf(-1)
	beta := math.Inf(1)
	for i := 0; i < b.N; i++ {
		m.Minimax(board, 5, alpha, beta)
	}
}
