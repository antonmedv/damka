package main

import (
	_ "embed"
	"fmt"
	"os"
	"time"

	. "checkers/src"
)

func main() {
	b := Board{}.
		Set(Parse("a7"), X).
		Set(Parse("c5"), O).
		Set(Parse("e5"), X).
		Set(Parse("h2"), X)
	fmt.Printf("Starting position:\n%s\n", b)
	minimax(b)
}

func minimax(b Board) {
	var db EndgameDB
	var err error
	db, err = os.ReadFile("endgame.db")
	if err != nil {
		panic(err)
	}

	m := NewMinimax(Zero, 8, db)

	start := time.Now()
	best, rate, steps := m.BestMove(b, true)
	d := time.Since(start)

	fmt.Println(best)
	fmt.Printf("  best move: %v\n", b.GenerateMoveName(best))
	fmt.Printf("       rate: %v\n", rate)
	fmt.Printf("      steps: %v\n", steps)
	fmt.Printf("   duration: %.2f seconds\n", d.Seconds())
	fmt.Printf("  evaluated: %v\n", m.Evaluated)
	fmt.Printf("   cut offs: %v\n", m.CutOffs)
	fmt.Printf(" cache size: %v\n", len(m.Cache))
	fmt.Printf(" cache hits: %v\n", m.CacheHits)
	fmt.Printf("    db hits: %v\n", m.DBHits)
}
