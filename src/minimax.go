package src

import (
	"fmt"
	"math"
)

var (
	Inf      = math.Inf(1)
	MinusInf = math.Inf(-1)
)

type Minimax struct {
	MaxDepth int
	Net      *Network
	Cache    map[Params]Score
	DB       EndgameDB

	// Internal
	nodes []float64

	// Stats
	Evaluated int
	CutOffs   int
	CacheHits int
	DBHits    int
}

type Params struct {
	board Board
	depth int
	alpha float64
	beta  float64
}

type Score struct {
	Rate  float64
	Steps int
}

func (s Score) Byte() byte {
	var b byte = 0
	switch s.Rate {
	case 1:
		b = 0b10000000
	case -1:
		b = 0b01000000
	case 0:
		b = 0b11000000
	}
	steps := s.Steps
	if steps > 0b00111111 {
		steps = 0b00111111
	}
	b |= byte(steps)
	return b
}

func NewMinimax(net *Network, maxDepth int, db EndgameDB) *Minimax {
	return &Minimax{
		Net:      net,
		MaxDepth: maxDepth,
		DB:       db,
		Cache:    make(map[Params]Score),
		nodes:    net.NewNodes(),
	}
}

func (m *Minimax) ClearStats() {
	m.Evaluated = 0
	m.CutOffs = 0
	m.CacheHits = 0
	m.DBHits = 0
}

func (m *Minimax) BestMove(b Board, debug bool) (Board, float64, int) {
	possibleMoves := b.AllMoves()
	lose := len(possibleMoves) == 0

	if lose {
		if b.IsWhiteTurn() {
			panic("white lost")
		} else {
			panic("black lost")
		}
	} else if b.IsDraw() {
		panic("draw")
	}

	if b.IsWhiteTurn() {
		// Return the best move.
		bestRate := MinusInf
		var bestMove Board
		for _, move := range possibleMoves {
			rate, _ := m.Minimax(move, m.MaxDepth, MinusInf, Inf)
			if rate > bestRate {
				bestRate = rate
				bestMove = move
			}
			if debug {
				fmt.Printf("white %s: (%.10f)\n", b.GenerateMoveName(move), rate)
			}
		}
		return bestMove, bestRate, 144
	} else {
		// Return the best move.
		bestRate := Inf
		var bestMove Board
		for _, move := range possibleMoves {
			rate, _ := m.Minimax(move, m.MaxDepth, MinusInf, Inf)
			if rate < bestRate {
				bestRate = rate
				bestMove = move
			}
			if debug {
				fmt.Printf("black %s: (%.10f)\n", b.GenerateMoveName(move), rate)
			}
		}
		return bestMove, bestRate, -144
	}
}

func (m *Minimax) BestRandomMove(b Board, debug bool) (Board, float64) {
	possibleMoves := b.AllMoves()
	lose := len(possibleMoves) == 0

	if lose {
		if b.IsWhiteTurn() {
			panic("white lost")
		} else {
			panic("black lost")
		}
	} else if b.IsDraw() {
		panic("draw")
	}

	if b.IsWhiteTurn() {
		// Collect rates and moves in separate slices.
		rates := make([]float64, len(possibleMoves))
		moves := make([]Board, len(possibleMoves))
		for i, move := range possibleMoves {
			rate, steps := m.Minimax(move, m.MaxDepth, MinusInf, Inf)
			rate = 1 + rate
			rates[i] = rate
			moves[i] = move
			if debug {
				fmt.Printf("white %s: (%.10f %d)\n", b.GenerateMoveName(move), rate, steps)
			}
		}
		index := weightedRandomPick(rates)
		return moves[index], rates[index]
	} else {
		// Collect rates and moves in separate slices.
		rates := make([]float64, len(possibleMoves))
		moves := make([]Board, len(possibleMoves))
		for i, move := range possibleMoves {
			rate, steps := m.Minimax(move, m.MaxDepth, MinusInf, Inf)
			rate = 1 + -rate
			rates[i] = rate
			moves[i] = move
			if debug {
				fmt.Printf("black %s: (%.10f %d)\n", b.GenerateMoveName(move), rate, steps)
			}
		}
		// Choose a random move based on the rates.
		index := weightedRandomPick(rates)
		return moves[index], rates[index]
	}
}

// Minimax returns the best rate for the given board.
func (m *Minimax) Minimax(b Board, depth int, alpha, beta float64) (float64, int) {
	if m.DB != nil {
		if rate, steps, ok := m.DB.LookUp(b); ok {
			m.DBHits++
			return rate, steps
		}
	}

	p := Params{b, depth, alpha, beta}
	if score, ok := m.Cache[p]; ok {
		m.CacheHits++
		return score.Rate, score.Steps
	}

	possibleMoves, eatMoves := b.AllMovesWithFlag()
	lose := len(possibleMoves) == 0

	if lose {
		if b.IsWhiteTurn() {
			return -1, 0
		} else {
			return 1, 0
		}
	} else if b.IsDraw() {
		return 0, 0
	}

	if len(possibleMoves) == 1 {
		rate, steps := m.Minimax(possibleMoves[0], depth, alpha, beta)
		return rate, steps + 1
	}

	if depth <= 0 && !eatMoves {
		m.Evaluated++
		rate := m.Net.Evaluate(b, m.nodes)
		m.Cache[p] = Score{rate, 0}
		return rate, 0
	}

	if b.IsWhiteTurn() {
		maxRate := MinusInf
		minSteps := 0
		for _, move := range possibleMoves {
			rate, steps := m.Minimax(move, depth-1, alpha, beta)
			if rate > maxRate {
				maxRate = rate
				minSteps = steps
			} else if rate == maxRate {
				if rate == -1 {
					if steps > minSteps {
						minSteps = steps
					}
				} else {
					if steps < minSteps {
						minSteps = steps
					}
				}
			}
			if rate > alpha {
				alpha = rate
			}
			if beta <= alpha {
				m.CutOffs++
				break
			}
		}
		m.Cache[p] = Score{maxRate, minSteps + 1}
		return maxRate, minSteps + 1
	} else {
		var minRate = Inf
		var minSteps = 0
		for _, move := range possibleMoves {
			rate, steps := m.Minimax(move, depth-1, alpha, beta)
			if rate < minRate {
				minRate = rate
				minSteps = steps
			} else if rate == minRate {
				if rate == 1 {
					if steps > minSteps {
						minSteps = steps
					}
				} else {
					if steps < minSteps {
						minSteps = steps
					}
				}
			}
			if rate < beta {
				beta = rate
			}
			if beta <= alpha {
				m.CutOffs++
				break
			}
		}
		m.Cache[p] = Score{minRate, minSteps + 1}
		return minRate, minSteps + 1
	}
}
