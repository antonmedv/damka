package src

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"sync"
	"text/tabwriter"
)

type Breed struct {
	sync.Mutex
	Name   string
	Parent string
	Age    int
	Gen    int
	Net    *Network
	Score  float64
	Wins   int
	Losses int
	Draws  int
	Sigma  []float64
}

func CreateRandomBreed(layers []int) *Breed {
	net := GenerateRandomNetwork(layers)
	sigma := make([]float64, len(net.Weights)+len(net.Biases))
	for i := range sigma {
		sigma[i] = .05
	}
	return &Breed{
		Name:  GenerateRandomName(),
		Gen:   1,
		Net:   net,
		Sigma: sigma,
	}
}

func (b *Breed) Mutate() *Breed {
	T := 1 / math.Sqrt(2*math.Sqrt(float64(len(b.Net.Weights))))
	sigma := make([]float64, len(b.Sigma))
	for i := range b.Sigma {
		sigma[i] = b.Sigma[i] * math.Exp(T*rand.NormFloat64())
	}

	net := b.Net.Copy()
	for i := range net.Weights {
		net.Weights[i] += sigma[i] * rand.NormFloat64()
	}
	for i := range net.Biases {
		net.Biases[i] += sigma[len(net.Weights)+i] * rand.NormFloat64()
	}

	newBreed := &Breed{
		Name:   GenerateRandomName(),
		Parent: b.Name,
		Gen:    b.Gen + 1,
		Net:    net,
		Sigma:  sigma,
	}

	return newBreed
}

func (b *Breed) ClearStats() {
	b.Score = 0
	b.Wins = 0
	b.Losses = 0
	b.Draws = 0
}

func BreedTitle(w *tabwriter.Writer) {
	_, _ = fmt.Fprintln(w, "\tName\tParent\tAge\tGen\tScore\tWins\tLosses\tDraws")
}

func (b *Breed) Print(w *tabwriter.Writer, title string) {
	_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\t%.2f\t%d\t%d\t%d\n", title, b.Name, b.Parent, b.Age, b.Gen, b.Score, b.Wins, b.Losses, b.Draws)
}

func LoadPopulation(filepath string) []*Breed {
	buf, err := os.ReadFile(filepath)
	if err != nil {
		panic(err)
	}
	var population []*Breed
	err = json.Unmarshal(buf, &population)
	if err != nil {
		panic(err)
	}
	return population
}
