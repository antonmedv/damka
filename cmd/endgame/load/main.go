package main

import (
	_ "embed"
	"fmt"
	"os"
	"strconv"

	. "checkers/src"
)

func main() {
	tier, err := strconv.Atoi(os.Args[1])
	if err != nil {
		panic(err)
	}

	fmt.Printf("Creating endgame database tier %v...\n", tier)
	db := CreateEndgameList(tier)

	fmt.Println("Loading endgame database...")
	_, err = os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}

	for _, b := range db.List {
		fmt.Printf("\n%v\n", b)
		if b.IsWhiteTurn() {
			fmt.Print("white moves ")
		} else {
			fmt.Print("black moves ")
		}
		score := db.Map[b]
		if score == nil {
			fmt.Println("no score")
			continue
		}
		switch score.Rate {
		case 1:
			fmt.Printf("and white wins in %v steps\n", score.Steps)
		case -1:
			fmt.Printf("and black wins in %v steps\n", score.Steps)
		case 0:
			fmt.Printf("and draw in %v steps\n", score.Steps)
		default:
			fmt.Printf("invalid rate %v\n", score.Rate)
		}
	}
	fmt.Printf("list len: %v\n", len(db.List))
	fmt.Printf("map len: %v\n", len(db.Map))
}
