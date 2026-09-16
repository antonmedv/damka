package main

import "testing"

// perft counts leaf nodes, ignoring the draw rule, exactly like
// src/engine/perft.ts; the frozen counts come from the engine's tests.
func perft(w, b, k uint32, side, depth int, gens []*Gen) uint64 {
	if depth == 0 {
		return 1
	}
	moves := append([]Succ(nil), gens[depth-1].Successors(w, b, k, side)...)
	if depth == 1 {
		return uint64(len(moves))
	}
	var nodes uint64
	for _, m := range moves {
		nodes += perft(m.W, m.B, m.K, side^1, depth-1, gens)
	}
	return nodes
}

func TestPerftInitial(t *testing.T) {
	gens := make([]*Gen, 16)
	for i := range gens {
		gens[i] = &Gen{}
	}
	want := []uint64{1, 7, 49, 302, 1469, 7482, 37986, 190146, 929899}
	for depth, n := range want {
		if got := perft(0x00000fff, 0xfff00000, 0, white, depth, gens); got != n {
			t.Errorf("perft(%d) = %d, want %d", depth, got, n)
		}
	}
}

// Fixtures with kings, promotion and capture choices; the counts come
// from the TypeScript engine (src/engine/perft.ts) on the same positions.
func TestPerftFixtures(t *testing.T) {
	gens := make([]*Gen, 16)
	for i := range gens {
		gens[i] = &Gen{}
	}
	cases := []struct {
		name    string
		w, b, k uint32
		side    int
		want    []uint64
	}{
		{"midgame", 44887, 3623092224, 0, white, []uint64{1, 8, 38, 168, 704, 3119, 14709}},
		{"kings", 8456, 2182086656, 2147491848, white, []uint64{1, 1, 9, 86, 681, 5349, 39472}},
		{"tactics", 28304, 276692992, 268435584, black, []uint64{1, 5, 10, 27, 85, 246, 956}},
		{"kingsonly", 513, 3221225472, 3221225985, white, []uint64{1, 10, 78, 529, 2965, 22546, 164898}},
		{"promo", 7340032, 50331656, 8, white, []uint64{1, 2, 8, 44, 250, 1382, 8148}},
	}
	for _, c := range cases {
		for depth, n := range c.want {
			if got := perft(c.w, c.b, c.k, c.side, depth, gens); got != n {
				t.Errorf("%s: perft(%d) = %d, want %d", c.name, depth, got, n)
			}
		}
	}
}
