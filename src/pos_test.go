package src_test

import (
	"testing"

	. "checkers/src"
	"github.com/stretchr/testify/assert"
)

func TestPosString(t *testing.T) {
	assert.Equal(t, "b8", PosString(0))
	assert.Equal(t, "g5", PosString(15))
	assert.Equal(t, "g1", PosString(31))
}

func TestParsePos(t *testing.T) {
	assert.Equal(t, Pos(0), Parse("b8"))
	assert.Equal(t, Pos(15), Parse("g5"))
	assert.Equal(t, Pos(31), Parse("g1"))
}

func TestGotoDir(t *testing.T) {
	assert.Equal(t, Parse("b4"), GotoDir(Parse("c3"), UpLeft))
	assert.Equal(t, Parse("d4"), GotoDir(Parse("c3"), UpRight))
	assert.Equal(t, Parse("b2"), GotoDir(Parse("c3"), DownLeft))
	assert.Equal(t, Parse("d2"), GotoDir(Parse("c3"), DownRight))

	assert.Equal(t, End, GotoDir(Parse("a1"), UpLeft))
	assert.Equal(t, Parse("b2"), GotoDir(Parse("a1"), UpRight))
	assert.Equal(t, End, GotoDir(Parse("a1"), DownLeft))
	assert.Equal(t, End, GotoDir(Parse("a1"), DownRight))

	assert.Equal(t, Parse("f2"), GotoDir(Parse("g1"), UpLeft))
	assert.Equal(t, Parse("h2"), GotoDir(Parse("g1"), UpRight))
	assert.Equal(t, End, GotoDir(Parse("g1"), DownLeft))
	assert.Equal(t, End, GotoDir(Parse("g1"), DownRight))

	assert.Equal(t, End, GotoDir(Parse("h8"), UpLeft))
	assert.Equal(t, End, GotoDir(Parse("h8"), UpRight))
	assert.Equal(t, Parse("g7"), GotoDir(Parse("h8"), DownLeft))
	assert.Equal(t, End, GotoDir(Parse("h8"), DownRight))
}
