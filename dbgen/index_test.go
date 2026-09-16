package main

import (
	"math/rand"
	"testing"
)

func TestRankRoundTrip(t *testing.T) {
	for _, d := range []*domain{whiteMenDomain, blackMenDomain, kingDomain} {
		for k := 0; k <= 3; k++ {
			n := choose(d.n, k)
			for r := uint64(0); r < n; r++ {
				sub := d.unrank(r, k)
				if got := d.rank(sub, k); got != r {
					t.Fatalf("domain %d k=%d rank(unrank(%d)) = %d", d.n, k, r, got)
					return
				}
			}
		}
	}
}

func TestIndexRoundTrip(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	slices := []Slice{{1, 0, 1, 0}, {0, 2, 0, 1}, {2, 1, 1, 1}, {1, 1, 2, 0}}
	for _, s := range slices {
		l := newLayout(s)
		for n := 0; n < 20000; n++ {
			idx := uint64(rng.Int63n(int64(l.size)))
			w, b, k, ok := l.position(idx)
			if !ok {
				continue
			}
			if sliceOf(w, b, k) != s {
				t.Fatalf("%v: index %d decoded to slice %v", s, idx, sliceOf(w, b, k))
			}
			if got := l.index(w, b, k); got != idx {
				t.Fatalf("%v: index(position(%d)) = %d", s, idx, got)
			}
		}
	}
}

func TestMirrorRoundTrip(t *testing.T) {
	w, b, k := uint32(0x00000103), uint32(0x50000000), uint32(0x40000001)
	w2, b2, k2 := mirror(w, b, k)
	w3, b3, k3 := mirror(w2, b2, k2)
	if w3 != w || b3 != b || k3 != k {
		t.Fatalf("mirror is not its own inverse")
	}
}
