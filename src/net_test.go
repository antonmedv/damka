package src

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewNetwork_Simple(t *testing.T) {
	net := NewNetwork([]int{128, 1})
	assert.Len(t, net.Weights, 128)
	assert.Len(t, net.Biases, 1)
}

func TestNewNetwork(t *testing.T) {
	net := NewNetwork([]int{128, 32, 32, 1})
	assert.Len(t, net.Weights, 5152)
	assert.Len(t, net.Biases, 65)
}

func TestNewNetworkAlt(t *testing.T) {
	net := NewNetwork([]int{128, 12, 8, 1})
	assert.Equal(t, len(net.Weights), 1640)
	assert.Equal(t, len(net.Biases), 21)
}

func TestNetwork_Input_SomeBoard(t *testing.T) {
	net := NewNetwork([]int{128, 32, 32, 1})
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

func TestNetwork_Evaluate_Zero(t *testing.T) {
	net := Zero
	b := NewBoard()
	assert.Equal(t, .0, net.Evaluate(b, net.NewNodes()))
	assert.Equal(t, .0, net.Evaluate(b.Transpose(), net.NewNodes()))
}
