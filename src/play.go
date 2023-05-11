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

func Play(b Board, player, opponent *Minimax, debug bool) Status {
	moveNumber := 0
	for {
		if debug {
			fmt.Printf("\033[2J\033[H")
			fmt.Printf("%v\n\n", b)
		}

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
		if b.IsWhiteTurn() {
			move, rate, _ = player.BestMove(b, debug)
		} else {
			move, rate, _ = opponent.BestMove(b, debug)
		}
		if debug {
			fmt.Printf("best %v move: %v (%.10f)\n", b.TurnString(), b.GenerateMoveName(move), rate)
		}
		b = move
	}
}
