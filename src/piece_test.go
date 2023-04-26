package src_test

import (
	"testing"

	. "checkers/src"
	"github.com/stretchr/testify/assert"
)

func TestIsWhite(t *testing.T) {
	assert.False(t, IsWhite(Empty))
	assert.True(t, IsWhite(WhiteMan))
	assert.True(t, IsWhite(WhiteKing))
	assert.False(t, IsWhite(BlackMan))
	assert.False(t, IsWhite(BlackKing))
}

func TestIsBlack(t *testing.T) {
	assert.False(t, IsBlack(Empty))
	assert.False(t, IsBlack(WhiteMan))
	assert.False(t, IsBlack(WhiteKing))
	assert.True(t, IsBlack(BlackMan))
	assert.True(t, IsBlack(BlackKing))
}

func TestIsMan(t *testing.T) {
	assert.False(t, IsMan(Empty))
	assert.True(t, IsMan(WhiteMan))
	assert.False(t, IsMan(WhiteKing))
	assert.True(t, IsMan(BlackMan))
	assert.False(t, IsMan(BlackKing))
}

func TestIsKing(t *testing.T) {
	assert.False(t, IsKing(Empty))
	assert.False(t, IsKing(WhiteMan))
	assert.True(t, IsKing(WhiteKing))
	assert.False(t, IsKing(BlackMan))
	assert.True(t, IsKing(BlackKing))
}
