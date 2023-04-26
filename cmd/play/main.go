package main

import (
	. "checkers/src"
	"fmt"
)

func main() {
	b := NewBoard()
	fmt.Printf("Starting position:\n%v\n\n", b)
	player1 := NewMinimax(NetHeiOay, 6, nil)
	player2 := NewMinimax(NetHeiOay, 6, nil)
	Play(b, player1, player2, true)
}
