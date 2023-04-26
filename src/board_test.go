package src_test

import (
	"testing"

	. "checkers/src"
	"github.com/stretchr/testify/assert"
)

func TestNewBoard(t *testing.T) {
	b := NewBoard()
	assert.Equal(t, `  a b c d e f g h
8   x   x   x   x 8
7 x   x   x   x   7
6   x   x   x   x 6
5 .   .   .   .   5
4   .   .   .   . 4
3 o   o   o   o   3
2   o   o   o   o 2
1 o   o   o   o   1
  a b c d e f g h  `, b.String())
}

func TestBoard_Set(t *testing.T) {
	b := NewBoard()
	b = b.Set(21, Empty)
	b = b.Set(17, WhiteKing)
	assert.Equal(t, `  a b c d e f g h
8   x   x   x   x 8
7 x   x   x   x   7
6   x   x   x   x 6
5 .   .   .   .   5
4   .   O   .   . 4
3 o   .   o   o   3
2   o   o   o   o 2
1 o   o   o   o   1
  a b c d e f g h  `, b.String())
}

func TestBoard_Set_And_Clear(t *testing.T) {
	b := Board{}
	for i := 0; i < 32; i++ {
		b = b.Set(Pos(i), BlackKing)
	}
	for i := 0; i < 32; i++ {
		b = b.Set(Pos(i), Empty)
	}
	u, v := b.Bits()
	assert.Equal(t, uint64(0), u)
	assert.Equal(t, uint64(0), v)
}

func TestBoard_Turn(t *testing.T) {
	b := Board{}
	assert.True(t, b.IsWhiteTurn())
	b = b.Turn(false)
	assert.True(t, b.IsBlackTurn())
	b = b.Turn(false)
	assert.True(t, b.IsWhiteTurn())
}

func TestBoard_Transpose(t *testing.T) {
	a := Board{}.
		Set(28, WhiteMan).
		Set(24, BlackMan).
		Set(21, BlackMan).
		SetOnlyKingMoves(10)
	b := a.Transpose()
	assert.Equal(t, a, a.Transpose().Transpose())
	assert.Equal(t, b, b.Transpose().Transpose())

	assert.Equal(t, 10, a.OnlyKingMoves())
	assert.Equal(t, 10, b.OnlyKingMoves())

	assert.True(t, a.IsWhiteTurn())
	assert.Equal(t, `  a b c d e f g h
8   .   .   .   . 8
7 .   .   .   .   7
6   .   .   .   . 6
5 .   .   .   .   5
4   .   .   .   . 4
3 .   x   .   .   3
2   x   .   .   . 2
1 o   .   .   .   1
  a b c d e f g h  `, a.String())

	assert.True(t, b.IsBlackTurn())
	assert.Equal(t, `  a b c d e f g h
8   .   .   .   x 8
7 .   .   .   o   7
6   .   .   o   . 6
5 .   .   .   .   5
4   .   .   .   . 4
3 .   .   .   .   3
2   .   .   .   . 2
1 .   .   .   .   1
  a b c d e f g h  `, b.String())
}

func TestBoard_SetOnlyKingMoves(t *testing.T) {
	b := NewBoard()
	assert.Equal(t, 0, b.OnlyKingMoves())
	b = b.SetOnlyKingMoves(30)
	assert.Equal(t, 30, b.OnlyKingMoves())
	b = b.SetOnlyKingMoves(0)
	assert.Equal(t, 0, b.OnlyKingMoves())
}
