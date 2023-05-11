package src_test

import (
	"fmt"
	"math"
	"testing"

	. "checkers/src"
	"github.com/stretchr/testify/assert"
)

func TestNewNetwork(t *testing.T) {
	net := NewNetwork([]int{32, 40, 10, 1})
	assert.Len(t, net.Weights, 1690)
	assert.Len(t, net.Biases, 51)
}

func TestNetwork_Evaluate_on_NewBoard(t *testing.T) {
	net := NewNetwork([]int{32, 40, 10, 1})
	b := NewBoard()

	x := net.NewNodes()
	sum := net.Evaluate(b, x)

	assert.Equal(t, .0, sum)
	assert.Equal(t, "[-1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]", fmt.Sprint(x))
}

func TestNetwork_Evaluate_SomeBoard(t *testing.T) {
	net := GenerateRandomNetwork([]int{32, 40, 10, 1})
	b := Board{}.
		Set(Parse("a7"), X).
		Set(Parse("c5"), O).
		Set(Parse("e5"), X).
		Set(Parse("h2"), WhiteMan).
		Set(Parse("h4"), BlackMan)

	x := net.NewNodes()
	xSum := net.Evaluate(b, x)

	d := b.Transpose()
	y := net.NewNodes()
	ySum := net.Evaluate(d, y)

	assert.Equal(t, xSum, -ySum)
	assert.Equal(t, x, y)
}

func TestNetwork_Evaluate_Zero_NewBoard(t *testing.T) {
	net := NewNetwork([]int{128, 32, 32, 1})
	b := NewBoard()
	assert.Equal(t, .0, net.Evaluate(b, net.NewNodes()))
	assert.Equal(t, .0, net.Evaluate(b.Transpose(), net.NewNodes()))
}

func TestNetwork_Evaluate_Zero_SomeBoard(t *testing.T) {
	net := NewNetwork([]int{32, 40, 10, 1})
	b := Board{}.
		Set(0, WhiteMan).
		Set(1, WhiteMan).
		Set(2, WhiteMan).
		Set(4, WhiteKing).
		Set(5, BlackKing)
	assert.Equal(t, math.Tanh(3.0), net.Evaluate(b, net.NewNodes()))
}
