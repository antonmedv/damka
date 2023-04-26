package src

import (
	"fmt"
	"io"
)

type EndgameList struct {
	List []Board
	Map  map[Board]*Score
}

func (db *EndgameList) Save(out io.Writer) error {
	data := make([]byte, EndgameDbSizeBytes)
	for _, b := range db.List {
		s := db.Map[b]
		var buf byte = 0
		switch s.Rate {
		case 1:
			buf = 0b10000000
		case -1:
			buf = 0b01000000
		case 0:
			buf = 0b11000000
		}
		steps := s.Steps
		if steps > 0b00111111 {
			fmt.Printf("steps overflow: %v steps\n%v\n", s.Steps, b)
			steps = 0b00111111
		}
		buf |= byte(steps)
		index, flip, ok := Index(b)
		if !ok {
			return fmt.Errorf("no index:\n%v\n", b)
		}
		if flip != 1 {
			return fmt.Errorf("wrong flip: %v\n%v\n", flip, b)
		}
		data[index] = buf
	}
	_, err := out.Write(data)
	return err
}

func CreateEndgameList(tier int) *EndgameList {
	db := &EndgameList{
		List: make([]Board, 0),
		Map:  make(map[Board]*Score),
	}

	alreadyAdded := make(map[Board]bool)
	add := func(b Board) {
		if alreadyAdded[b] {
			return
		}
		alreadyAdded[b] = true
		db.List = append(db.List, b)
	}

	if tier >= 2 {
		p2 := [][2]Piece{
			{O, X},
		}
		for _, p := range p2 {
			for i := 0; i < 32; i++ {
				for j := 0; j < 32; j++ {
					if i == j {
						continue
					}
					b := Board{}.
						Set(Pos(i), p[0]).
						Set(Pos(j), p[1])
					add(b)
					add(b.Turn(false))
				}
			}
		}
	}

	if tier >= 3 {
		p3 := [][3]Piece{
			{O, X, X},
		}
		for _, p := range p3 {
			for i := 0; i < 32; i++ {
				for j := 0; j < 32; j++ {
					for k := 0; k < 32; k++ {
						if i == j || i == k || j == k {
							continue
						}
						b := Board{}.
							Set(Pos(i), p[0]).
							Set(Pos(j), p[1]).
							Set(Pos(k), p[2])
						add(b)
						add(b.Turn(false))
					}
				}
			}
		}
	}

	if tier >= 4 {
		p4 := [][4]Piece{
			{O, X, X, X},
			{O, O, X, X},
		}
		for _, p := range p4 {
			for i := 0; i < 32; i++ {
				for j := 0; j < 32; j++ {
					for k := 0; k < 32; k++ {
						for l := 0; l < 32; l++ {
							if i == j || i == k || i == l || j == k || j == l || k == l {
								continue
							}
							b := Board{}.
								Set(Pos(i), p[0]).
								Set(Pos(j), p[1]).
								Set(Pos(k), p[2]).
								Set(Pos(l), p[3])
							add(b)
							add(b.Turn(false))
						}
					}
				}
			}
		}
	}

	if tier >= 5 {
		p5 := [][5]Piece{
			{O, X, X, X, X},
			{O, O, X, X, X},
		}
		for _, p := range p5 {
			for i := 0; i < 32; i++ {
				for j := 0; j < 32; j++ {
					for k := 0; k < 32; k++ {
						for l := 0; l < 32; l++ {
							for m := 0; m < 32; m++ {
								if i == j || i == k || i == l || i == m || j == k || j == l || j == m || k == l || k == m || l == m {
									continue
								}
								b := Board{}.
									Set(Pos(i), p[0]).
									Set(Pos(j), p[1]).
									Set(Pos(k), p[2]).
									Set(Pos(l), p[3]).
									Set(Pos(m), p[4])
								add(b)
								add(b.Turn(false))
							}
						}
					}
				}
			}
		}
	}

	return db
}

type EndgameMinimax struct {
	Cache     map[Board]Score
	CacheHits int
}

func (m *EndgameMinimax) ClearStats() {
	m.CacheHits = 0
}

// Minimax is a special minimax without depth (meaning it will always reach
// the endgame). No alpha-beta pruning is used, as it will return wrong results for
// a number of minimum steps.
func (m *EndgameMinimax) Minimax(b Board) (float64, int) {
	// Only cache lookups is done. EndgameDB lookups removed, as it gives wrong
	// results for draw positions (17 instead of 15)..

	if score, ok := m.Cache[b]; ok {
		m.CacheHits++
		return score.Rate, score.Steps
	}

	possibleMoves := b.AllMoves()
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

	if b.IsWhiteTurn() {
		maxRate := MinusInf
		minSteps := 0
		for _, move := range possibleMoves {
			rate, steps := m.Minimax(move)
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
		}
		m.Cache[b] = Score{maxRate, minSteps + 1}
		return maxRate, minSteps + 1
	} else {
		var minRate = Inf
		var minSteps = 0
		for _, move := range possibleMoves {
			rate, steps := m.Minimax(move)
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
		}
		m.Cache[b] = Score{minRate, minSteps + 1}
		return minRate, minSteps + 1
	}
}

type EndgameDB []byte

func (db EndgameDB) LookUp(b Board) (float64, int, bool) {
	index, flip, ok := Index(b)
	if !ok {
		return 0, 0, false
	}
	buf := db[index]
	var rate float64
	switch buf & 0b11000000 {
	case 0b10000000:
		rate = 1
	case 0b01000000:
		rate = -1
	case 0b11000000:
		rate = 0
	default:
		return 0, 0, false
	}
	steps := int(buf & 0b00111111)
	return flip * rate, steps, true
}

type Kind int

// Kinds of endgame databases:
//	1001
//	1002
//	1003
//	2002
//	1004
//	2003

var (
	kindOffsets        = map[Kind]int{}
	EndgameDbSizeBytes = 0
)

func init() {
	offset := 0

	kindOffsets[Kind(1001)] = offset
	offset += 2 * progression(32, 2)

	kindOffsets[Kind(1002)] = offset
	offset += 2 * progression(32, 3)

	kindOffsets[Kind(1003)] = offset
	offset += 2 * progression(32, 4)

	kindOffsets[Kind(2002)] = offset
	offset += 2 * progression(32, 4)

	kindOffsets[Kind(1004)] = offset
	offset += 2 * progression(32, 5)

	kindOffsets[Kind(2003)] = offset
	offset += 2 * progression(32, 5)

	EndgameDbSizeBytes = offset
}

func Index(b Board) (int, float64, bool) {
	o := make([]int, 0, 4)
	x := make([]int, 0, 4)
	for i := 0; i < 32; i++ {
		piece := b.Get(Pos(i))
		switch piece {
		case WhiteKing:
			if cap(o) == len(o) {
				return 0, 0, false
			}
			o = append(o, i)
		case BlackKing:
			if cap(x) == len(x) {
				return 0, 0, false
			}
			x = append(x, i)
		case WhiteMan, BlackMan:
			return 0, 0, false
		}
	}
	kind := Kind(len(o)*1000 + len(x))
	if offset, ok := kindOffsets[kind]; ok {
		index := offset
		if b.IsBlackTurn() {
			index += progression(32, len(o)+len(x))
		}
		for i := 0; i < len(o); i++ {
			index += o[i] * pow(32, i)
		}
		for i := 0; i < len(x); i++ {
			index += x[i] * pow(32, len(o)+i)
		}
		return index, 1, true
	}
	kind = Kind(len(x)*1000 + len(o))
	if offset, ok := kindOffsets[kind]; ok {
		index := offset
		if b.IsWhiteTurn() {
			index += progression(32, len(o)+len(x))
		}
		for i := 0; i < len(x); i++ {
			index += x[i] * pow(32, i)
		}
		for i := 0; i < len(o); i++ {
			index += o[i] * pow(32, len(x)+i)
		}
		return index, -1, true
	}
	return 0, 0, false
}

func progression(base, power int) int {
	if power == 1 {
		return base
	}
	return progression(base, power-1) + pow(base, power)
}

func pow(base, power int) int {
	if power == 0 {
		return 1
	}
	return base * pow(base, power-1)
}
