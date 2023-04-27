package src

import "math"

var defaultLayers = []int{128, 32, 32, 1}
var (
	Zero = NewNetwork()
	One  = NewNetworkWithOne()
)

type Network struct {
	Layers   []int
	Weights  []float64
	Biases   []float64
	NodesLen int
}

func NewNetwork() *Network {
	layers := defaultLayers
	weightsLen := 0
	prevLayerLen := 0
	nodesLen := 0
	for _, layerLen := range layers {
		weightsLen += layerLen * prevLayerLen
		prevLayerLen = layerLen
		nodesLen += layerLen
	}

	biasesLen := 0
	// Skip first layer, it's input layer. It has no biases.
	for i := 1; i < len(layers); i++ {
		biasesLen += layers[i]
	}

	return &Network{
		Layers:   layers,
		Weights:  make([]float64, weightsLen),
		Biases:   make([]float64, biasesLen),
		NodesLen: nodesLen,
	}
}

func (net *Network) Copy() *Network {
	newNet := NewNetwork()
	copy(newNet.Weights, net.Weights)
	copy(newNet.Biases, net.Biases)
	return newNet
}

func NewNetworkWithOne() *Network {
	net := NewNetwork()
	for i := range net.Weights {
		net.Weights[i] = 1
	}
	return net
}

func (net *Network) NewNodes() []float64 {
	return make([]float64, net.NodesLen)
}

func (net *Network) Evaluate(b Board, nodes []float64) float64 {
	if b.IsWhiteTurn() {
		for i := Pos(0); i < 32; i++ {
			nodes[i] = value(b.Get(Pos(i)), 3)
			switch b.Get(i) {
			case WhiteMan:
				nodes[i] = 1
			case BlackMan:
				nodes[32+i] = 1
			case WhiteKing:
				nodes[64+i] = 1
			case BlackKing:
				nodes[96+i] = 1
			}
		}
	} else {
		for i := 31; i >= 0; i-- {
			j := 31 - i
			switch b.Get(Pos(i)) {
			case WhiteMan:
				nodes[32+j] = 1
			case BlackMan:
				nodes[j] = 1
			case WhiteKing:
				nodes[96+j] = 1
			case BlackKing:
				nodes[64+j] = 1
			}
		}
	}

	prevOffset := 0
	nodesOffset := 128
	weightIndex := 0
	biasIndex := 0
	for l := 1; l < len(net.Layers); l++ {
		for i := 0; i < net.Layers[l]; i++ {
			a := .0
			for p := 0; p < net.Layers[l-1]; p++ {
				a += nodes[prevOffset+p] * net.Weights[weightIndex]
				weightIndex++
			}
			a += net.Biases[biasIndex]
			biasIndex++

			// Activation function.
			nodes[nodesOffset+i] = math.Max(0, a)
		}
		prevOffset = nodesOffset
		nodesOffset += net.Layers[l]
	}

	rate := nodes[len(nodes)-1]

	if b.IsBlackTurn() {
		rate = -rate
	}

	return math.Tanh(rate)
}
