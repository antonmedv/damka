package main

import (
	"fmt"

	. "checkers/src"
)

func main() {
	b := Board{}.
		Set(4, WhiteKing).
		Set(13, WhiteMan).
		Set(17, BlackKing).
		Turn(false)
	fmt.Printf("Starting position:\n%s\n", b)
	moves := b.AllMoves()
	for i, m := range moves {
		fmt.Printf("\n№%v %v\n%s\n", i+1, b.GenerateMoveName(m), m)
	}
}
