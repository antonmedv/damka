package src_test

import (
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

func TestNetwork_Evaluate(t *testing.T) {
	net := NewNetwork([]int{32, 40, 10, 1})
	b := Board{}.
		Set(0, WhiteMan).
		Set(1, WhiteMan).
		Set(2, WhiteMan).
		Set(4, WhiteKing).
		Set(5, BlackKing)
	assert.Equal(t, math.Tanh(3.0), net.Evaluate(b, net.NewNodes()))
}
