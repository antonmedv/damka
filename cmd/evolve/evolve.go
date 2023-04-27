package main

import (
	. "checkers/src"
	"fmt"
	"math"
	"math/rand"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"text/tabwriter"
)

const depth = 4
const popSize = 60

func main() {
	population := make([]*Breed, popSize)
	for i := range population {
		population[i] = createRandomBreed()
	}

	for gen := 1; ; gen++ {
		println("# Generation", gen)

		groups := groupPopulation(population, 7)
		games := make([]game, 0)
		for _, group := range groups {
			for i := 0; i < len(group); i++ {
				for j := i + 1; j < len(group); j++ {
					games = append(games, game{group[i], group[j]})
				}
			}
		}

		playGames(games)

		sort.Slice(population, func(i, j int) bool {
			return population[i].Score > population[j].Score
		})

		printStats(population)
		//printPopulation(population)

		// Save 50% of the population
		population = population[:popSize/2]

		for i := range population {
			population[i].Age++
			population[i].clearStats()
		}

		// Breed the population back to 100%
		for _, breed := range population {
			population = append(population, breed.mutate())
		}

		print("\n\n")
	}
}

func printStats(population []*Breed) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	breedTitle(w)

	long := population[0]
	best := population[0]
	unluckiest := population[popSize/2]
	worst := population[popSize-1]
	childrenCount := map[string]int{}
	for i, breed := range population {
		childrenCount[breed.Parent]++
		if i < popSize/2 {
			if breed.Age > long.Age {
				long = breed
			}
		}
	}
	mostChildren := ""
	for _, breed := range population {
		if childrenCount[breed.Name] > childrenCount[mostChildren] {
			mostChildren = breed.Name
		}
	}
	best.print(w, "Best Score")
	long.print(w, "Longest Survivor")
	unluckiest.print(w, "Unluckiest")
	worst.print(w, "Worst Score")
	_ = w.Flush()

	println()
	if mostChildren != "" {
		fmt.Printf("Most children: %v (%v)\n", mostChildren, childrenCount[mostChildren])
	}
}

func playGames(games []game) {
	// Define the size of the goroutine pool to CPU cores
	poolSize := runtime.NumCPU()
	gameChan := make(chan game, poolSize)
	var wg sync.WaitGroup

	// Create the pool of workers
	for i := 0; i < poolSize; i++ {
		go worker(gameChan, &wg)
	}

	// Add the games to the channel
	for i, g := range games {
		wg.Add(1)
		gameChan <- g
		progressBar(i+1, len(games), 50)
	}

	// Clear progress bar
	print("\r", strings.Repeat(" ", 60), "\r")

	close(gameChan)
	wg.Wait()
}

func worker(gameChan <-chan game, wg *sync.WaitGroup) {
	for g := range gameChan {
		g.play()
		wg.Done()
	}
}

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

func (b *Breed) mutate() *Breed {
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
		Name:   generateRandomName(),
		Parent: b.Name,
		Gen:    b.Gen + 1,
		Net:    net,
		Sigma:  sigma,
	}

	return newBreed
}

func (b *Breed) clearStats() {
	b.Score = 0
	b.Wins = 0
	b.Losses = 0
	b.Draws = 0
}

func breedTitle(w *tabwriter.Writer) {
	_, _ = fmt.Fprintln(w, "\tName\tParent\tAge\tGen\tScore\tWins\tLosses\tDraws")
}

func (b *Breed) print(w *tabwriter.Writer, title string) {
	_, _ = fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%d\t%.2f\t%d\t%d\t%d\n", title, b.Name, b.Parent, b.Age, b.Gen, b.Score, b.Wins, b.Losses, b.Draws)
}

type game struct {
	white *Breed
	black *Breed
}

func (g game) play() {
	playerOne := NewMinimax(g.white.Net, depth, nil)
	playerTwo := NewMinimax(g.black.Net, depth, nil)
	result := Play(NewBoard(), playerOne, playerTwo, false)

	g.white.Lock()
	defer g.white.Unlock()
	g.black.Lock()
	defer g.black.Unlock()

	switch result {
	case WhiteWins:
		g.white.Wins++
		g.white.Score += 1
		g.black.Losses++
		g.black.Score -= 1
	case BlackWins:
		g.white.Losses++
		g.white.Score -= 1
		g.black.Wins++
		g.black.Score += 1
	case Draw:
		g.white.Draws++
		g.black.Draws++
	}
}

func groupPopulation(population []*Breed, groupSize int) [][]*Breed {
	shufflePopulation(population)

	groupCount := (len(population) + groupSize - 1) / groupSize
	groups := make([][]*Breed, groupCount)

	for i := 0; i < groupCount; i++ {
		startIndex := i * groupSize
		endIndex := startIndex + groupSize
		if endIndex > len(population) {
			endIndex = len(population)
		}
		groups[i] = population[startIndex:endIndex]
	}

	return groups
}

func shufflePopulation(population []*Breed) {
	for i := len(population) - 1; i > 0; i-- {
		j := rand.Intn(i + 1)
		population[i], population[j] = population[j], population[i]
	}
}

func createRandomBreed() *Breed {
	net := generateRandomNetwork()
	sigma := make([]float64, len(net.Weights)+len(net.Biases))
	for i := range sigma {
		sigma[i] = .05
	}

	return &Breed{
		Name:  generateRandomName(),
		Gen:   1,
		Net:   net,
		Sigma: sigma,
	}
}

func generateRandomNetwork() *Network {
	net := NewNetwork()
	for i := range net.Weights {
		net.Weights[i] = rand.Float64()*2 - 1
	}
	for i := range net.Biases {
		net.Biases[i] = rand.Float64()*2 - 1
	}
	return net
}

func generateRandomName() string {
	minLength := 3
	maxLength := 5
	vowels := "aeiouy"
	consonants := "bcdfghjklmnpqrstvwxz"
	nameLength := rand.Intn(maxLength-minLength+1) + minLength
	name := make([]byte, nameLength)

	for i := 0; i < nameLength; i++ {
		if i%2 == 0 {
			name[i] = consonants[rand.Intn(len(consonants))]
		} else {
			name[i] = vowels[rand.Intn(len(vowels))]
		}
	}

	return string(name)
}

func progressBar(current, total, width int) {
	progress := float64(current) / float64(total)
	filled := int(progress * float64(width))
	empty := width - filled

	fmt.Printf("\r[")
	for i := 0; i < filled; i++ {
		fmt.Print("=")
	}
	for i := 0; i < empty; i++ {
		fmt.Print(" ")
	}
	fmt.Printf("] %3.0f%% ", progress*100)
}

func printPopulation(population []*Breed) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	breedTitle(w)
	for i, breed := range population {
		breed.print(w, fmt.Sprintf("%d.", i+1))
	}
	_ = w.Flush()
}
