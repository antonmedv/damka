package main

import (
	. "checkers/src"
)

func main() {
	b := NewBoard()
	player1 := NewMinimax(Zero, 6, nil)
	player2 := NewMinimax(Zero, 6, nil)
	Play(b, player1, player2, true)
}
