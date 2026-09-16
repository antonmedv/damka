package main

import (
	"fmt"
	"math/rand"
)

// dump prints random solved positions with their verdict at a fresh draw
// counter, for cross-checking against the TypeScript search.
func dump(db *DB, n int, seed int64) {
	rng := rand.New(rand.NewSource(seed))
	g := &Gen{}
	slices := slicesUpTo(db.max)
	for printed := 0; printed < n; {
		s := slices[rng.Intn(len(slices))]
		l := db.layouts[s]
		idx := uint64(rng.Int63n(int64(l.size)))
		w, b, k, ok := l.position(idx)
		if !ok {
			continue
		}
		// The engine resolves mandatory captures itself; skip those nodes.
		if len(g.Successors(w, b, k, white)) == 0 || hasCapture(w, b, k) {
			continue
		}
		v := db.tables[s][idx]
		verdict := "draw"
		switch {
		case v != valDraw && v < lossBase:
			verdict = fmt.Sprintf("win%d", v)
		case v >= lossBase:
			verdict = fmt.Sprintf("loss%d", int(v)-lossBase)
		}
		fmt.Printf("%s|%s\n", formatPos(w, b, k, white), verdict)
		printed++
	}
}
