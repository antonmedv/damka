package src

import (
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestNewNetwork(t *testing.T) {
	net := NewNetwork()
	assert.Len(t, net.Weights, 5152)
	assert.Len(t, net.Biases, 65)
}

func TestNetwork_Evaluate(t *testing.T) {
	net := NewNetworkWithOne()
	b := NewBoard()
	assert.Equal(t, 1, net.Evaluate(b, net.NewNodes()))
	assert.Equal(t, -1.0, net.Evaluate(b.Transpose(), net.NewNodes()))
}
