package src

import (
	"fmt"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestNewNetwork(t *testing.T) {
	net := NewNetwork()
	assert.Len(t, net.Weights, 5152)
	assert.Len(t, net.Biases, 65)
}

func TestNetwork_Input_on_NewBoard(t *testing.T) {
	net := NewNetwork()
	b := NewBoard()

	x := net.NewNodes()
	sum := net.InputLayer(b, x)

	assert.Equal(t, .0, sum)
	assert.Equal(t, "[0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0]", fmt.Sprint(x))
}

func TestNetwork_Input_SomeBoard(t *testing.T) {
	net := NewNetwork()
	b := Board{}.
		Set(Parse("a7"), X).
		Set(Parse("c5"), O).
		Set(Parse("e5"), X).
		Set(Parse("h2"), WhiteMan).
		Set(Parse("h4"), BlackMan)

	x := net.NewNodes()
	xSum := net.InputLayer(b, x)

	d := b.Transpose()
	y := net.NewNodes()
	ySum := net.InputLayer(d, y)

	assert.Equal(t, xSum, ySum)
	assert.Equal(t, x, y)
}

func TestNetwork_Evaluate(t *testing.T) {
	net := One
	b := NewBoard()
	assert.Equal(t, 1.0, net.Evaluate(b, net.NewNodes()))
	assert.Equal(t, -1.0, net.Evaluate(b.Transpose(), net.NewNodes()))
}

func TestNetwork_Evaluate_Zero(t *testing.T) {
	net := Zero
	b := NewBoard()
	assert.Equal(t, .0, net.Evaluate(b, net.NewNodes()))
	assert.Equal(t, .0, net.Evaluate(b.Transpose(), net.NewNodes()))
}
