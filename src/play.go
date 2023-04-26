package src

import (
	"fmt"
)

var (
	WhiteWins Status = 1
	BlackWins Status = -1
	Draw      Status = 0
)

type Status int8

func (s Status) String() string {
	switch s {
	case WhiteWins:
		return "WhiteWins"
	case BlackWins:
		return "BlackWins"
	case Draw:
		return "Draw"
	default:
		return "Unknown"
	}
}

type Player interface {
	BestMove(b Board, debug bool) (Board, float64, int)
}

func Play(b Board, player, opponent Player, debug bool) Status {
	moveNumber := 0
	for {
		moveNumber++

		moves := b.AllMoves()

		if len(moves) == 0 {
			if b.IsWhiteTurn() {
				if debug {
					fmt.Printf("Black wins\n")
				}
				return BlackWins
			} else {
				if debug {
					fmt.Printf("White wins\n")
				}
				return WhiteWins
			}
		}

		if b.IsDraw() {
			if debug {
				fmt.Printf("draw\n")
			}
			return Draw
		}

		if debug {
			fmt.Printf("Move %v\n", moveNumber)
		}

		var rate float64
		var move Board
		var steps int
		if b.IsWhiteTurn() {
			move, rate, steps = player.BestMove(b, debug)
		} else {
			move, rate, steps = opponent.BestMove(b, debug)
		}
		if debug {
			fmt.Printf("best %v move: %v (%.10f %v)\n%v\n\n", b.TurnString(), b.GenerateMoveName(move), rate, steps, move)
		}
		b = move
	}
}
