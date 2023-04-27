package main

import (
	. "checkers/src"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path"
	"runtime"
	"sort"
	"strings"
	"sync"
	"text/tabwriter"
	"time"
)

const depth = 4
const defaultPopSize = 60

var popSize = -1

func main() {
	var population []*Breed

	// Generate name of the population by current date and time.
	fileName := time.Now().Format("2006-01-02T150405.json")

	// If argument is provided, use it as a name of the population.
	if len(os.Args) > 1 {
		fileName = path.Base(os.Args[1])
		population = LoadPopulation(os.Args[1])
	} else {
		population = make([]*Breed, defaultPopSize)
		for i := range population {
			population[i] = CreateRandomBreed()
		}
	}

	popSize = len(population)

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
			population[i].ClearStats()
		}

		// Breed the population back to 100%
		for _, breed := range population {
			population = append(population, breed.Mutate())
		}

		// Marshal the population to JSON
		buf, err := json.Marshal(population)
		if err != nil {
			panic(err)
		}

		// Save to the file
		err = os.WriteFile("data/"+fileName, buf, 0644)
		if err != nil {
			panic(err)
		}

		print("\n\n")
	}
}

func printStats(population []*Breed) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	BreedTitle(w)

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
	best.Print(w, "Best Score")
	long.Print(w, "Longest Survivor")
	unluckiest.Print(w, "Unluckiest")
	worst.Print(w, "Worst Score")
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
	BreedTitle(w)
	for i, breed := range population {
		breed.Print(w, fmt.Sprintf("%d.", i+1))
	}
	_ = w.Flush()
}
