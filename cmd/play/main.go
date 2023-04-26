package main

import (
	"fmt"
	"os"

	. "checkers/src"
)

func main() {
	var db EndgameDB
	var err error
	db, err = os.ReadFile("endgame.db")
	if err != nil {
		panic(err)
	}

	b := NewBoard()
	fmt.Printf("Starting position:\n%v\n\n", b)
	player1 := NewMinimax(NetHeiOay, 6, nil)
	player2 := NewMinimax(NetHeiOay, 6, db)
	Play(b, player1, player2, true)
}
