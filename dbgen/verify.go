package main

import (
	"fmt"
	"math/rand"
)

// verify re-derives random table entries from their successors and
// reports the well known endings. It returns an error when an entry does
// not agree with its successors, so that a build cannot ship tables that
// failed their own check.
func verify(db *DB) error {
	g := &Gen{}
	rng := rand.New(rand.NewSource(7))
	bad := 0
	checked := 0
	for s, tab := range db.tables {
		l := db.layouts[s]
		for n := 0; n < 20000 && bad < 10; n++ {
			idx := uint64(rng.Int63n(int64(l.size)))
			w, b, k, ok := l.position(idx)
			if !ok {
				continue
			}
			checked++
			// A stored value must agree with a one-ply lookahead at every
			// budget it claims, and at the budget just below it as well.
			v := tab[idx]
			for _, budget := range []int{0, 1, 5, 15, 29, 30} {
				want := lookahead(db, g, w, b, k, budget)
				if got := outcome(v, budget); got != want {
					bad++
					fmt.Printf("MISMATCH %s budget %d: stored %d, lookahead %d (value byte %d)\n",
						formatPos(w, b, k, white), budget, got, want, v)
					break
				}
			}
		}
	}
	fmt.Printf("verified %d positions, %d mismatches\n", checked, bad)

	for _, c := range []struct {
		pos  string
		note string
	}{
		{"W:WKa1:BKh8", "king vs king"},
		{"W:WKa1,Kc1:BKh8", "two kings vs king"},
		{"W:WKa1,Kc1,Ke1:BKh8", "three kings vs king on the main road"},
		{"W:WKa1,Kc1,Ke1:BKh6", "three kings vs king off the main road"},
		{"W:WKa1,Kc1,Ke1,Kg1:BKh8", "four kings vs king"},
		{"W:WKc1,Ke1,Kg1:BKd4", "three kings vs king holding the main road"},
		{"W:WKc1,Ke1,Kg1:BKc5", "three kings vs king off the main road"},
		{"W:WKa1,Kc1,Ke1,Kg1:BKd4", "four kings vs king on the main road"},
		{"W:Wa1:Bh8", "man vs man"},
		{"W:WKa1:Bb8", "king vs man"},
	} {
		w, b, k, side, err := parsePos(c.pos)
		if err != nil {
			fmt.Println(err)
			continue
		}
		if side != white || sliceOf(w, b, k).Pieces() > db.max {
			continue
		}
		v := db.valueOf(w, b, k)
		fmt.Printf("%-40s %-12s %s\n", c.note, c.pos, describe(v))
	}
	if bad > 0 {
		return fmt.Errorf("%d of %d verified positions disagree with their successors", bad, checked)
	}
	return nil
}

func describe(v byte) string {
	switch {
	case v == valDraw:
		return "draw"
	case v < lossBase:
		return fmt.Sprintf("win, needs %d plies of counter", v)
	default:
		return fmt.Sprintf("loss, needs %d plies of counter", int(v)-lossBase)
	}
}

// lookahead is the value of a position at one budget, computed from the
// stored values of its children only.
func lookahead(db *DB, g *Gen, w, b, k uint32, budget int) int {
	moves := append([]Succ(nil), g.Successors(w, b, k, white)...)
	if len(moves) == 0 {
		return -1
	}
	if budget == 0 {
		return 0
	}
	best := -1
	for _, m := range moves {
		cw, cb, ck := mirror(m.W, m.B, m.K)
		childBudget := budget - 1
		if m.Zero {
			childBudget = maxBudget
		}
		if v := -outcome(db.valueOf(cw, cb, ck), childBudget); v > best {
			best = v
		}
	}
	return best
}
