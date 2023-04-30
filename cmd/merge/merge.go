package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sort"
	"sync"
	"text/tabwriter"
	"time"

	. "checkers/src"
)

const depth = 4

func main() {
	population := make([]*Breed, 0)
	for _, arg := range os.Args[1:] {
		population = append(population, LoadPopulation(arg)...)
	}

	gameChan := make(chan game)
	var wg sync.WaitGroup

	// Spawn worker goroutines
	for i := 0; i < runtime.NumCPU(); i++ {
		go worker(gameChan, &wg)
	}

	games := []game{}
	for i := range population {
		for j := i + 1; j < len(population); j++ {
			games = append(games, game{white: population[i], black: population[j]})
			games = append(games, game{white: population[j], black: population[i]})
		}
	}

	for i, g := range games {
		wg.Add(1)
		gameChan <- g
		ProgressBar(i, len(games), 50, "")
	}
	ClearProgressBar()
	wg.Wait()
	close(gameChan)

	// Sort population by score
	sort.Slice(population, func(i, j int) bool {
		return population[i].Score > population[j].Score
	})

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	BreedTitle(w)
	for i, b := range population {
		b.Print(w, fmt.Sprintf("%d.", i+1))
	}
	w.Flush()

	// Marshal the population to JSON
	buf, err := json.Marshal(population)
	if err != nil {
		panic(err)
	}

	// Save the population
	fileName := fmt.Sprintf("merged-%v.json", time.Now().Format("2006-01-02T15_04_05"))
	err = os.WriteFile("data/"+fileName, buf, 0644)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Saved to %v\n", fileName)
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
