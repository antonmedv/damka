package main

import "testing"

// The solver is what the whole database rests on, so the small set is
// solved in the test: every entry has to agree with a one-ply lookahead
// through the values of its successors, at every budget, and the answer
// must not depend on how many workers produced it.
func solveUpTo3(t *testing.T, workers int) *DB {
	t.Helper()
	db := newDB(3, workers)
	db.Solve(nil)
	return db
}

func TestSolvedValuesAgreeWithTheirSuccessors(t *testing.T) {
	db := solveUpTo3(t, 4)
	g := &Gen{}
	checked, bad := 0, 0
	for s, tab := range db.tables {
		l := db.layouts[s]
		for i := range tab {
			w, b, k, ok := l.position(uint64(i))
			if !ok {
				continue
			}
			checked++
			for _, budget := range []int{0, 1, 2, 7, 29, 30} {
				want := lookahead(db, g, w, b, k, budget)
				if got := outcome(tab[i], budget); got != want {
					bad++
					if bad < 5 {
						t.Errorf("%s at budget %d: stored %d, successors say %d",
							formatPos(w, b, k, white), budget, got, want)
					}
					break
				}
			}
		}
	}
	if checked < 100000 {
		t.Fatalf("only %d positions checked", checked)
	}
	if bad > 0 {
		t.Fatalf("%d of %d positions disagree with their successors", bad, checked)
	}
}

func TestWorkersDoNotChangeTheAnswer(t *testing.T) {
	one := solveUpTo3(t, 1)
	many := solveUpTo3(t, 8)
	for s, tab := range one.tables {
		other, ok := many.tables[s]
		if !ok {
			t.Fatalf("slice %v missing", s)
		}
		for i := range tab {
			if tab[i] != other[i] {
				t.Fatalf("slice %v index %d: %d on one worker, %d on eight",
					s, i, tab[i], other[i])
			}
		}
	}
}

func TestKnownEndings(t *testing.T) {
	db := solveUpTo3(t, 4)
	cases := []struct {
		pos  string
		want string
	}{
		// The lone king on the main road cannot be taken in the corner,
		// and every move along it walks into the other king.
		{"W:WKa1:BKh8", "loss, needs 2 plies of counter"},
		{"W:WKa1,Kc1:BKh8", "win, needs 3 plies of counter"},
		{"W:Wa1:Bh8", "draw"},
		{"W:WKa1:Bb8", "win, needs 2 plies of counter"},
	}
	for _, c := range cases {
		w, b, k, side, err := parsePos(c.pos)
		if err != nil {
			t.Fatalf("%s: %v", c.pos, err)
		}
		if side != white {
			t.Fatalf("%s: not white to move", c.pos)
		}
		if got := describe(db.valueOf(w, b, k)); got != c.want {
			t.Errorf("%s: %s, want %s", c.pos, got, c.want)
		}
	}
}

func TestVerifyRefusesACorruptedTable(t *testing.T) {
	db := solveUpTo3(t, 4)
	// Every position of one slice called a loss: whatever the successors
	// say, they cannot all say that.
	for s := range db.tables {
		tab := db.tables[s]
		for i := range tab {
			tab[i] = lossBase
		}
		break
	}
	if err := verify(db); err == nil {
		t.Fatal("verify accepted a table that disagrees with its successors")
	}
}
