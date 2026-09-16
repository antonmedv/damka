package main

import (
	"math/bits"
	"math/rand"
	"testing"
)

// The packer marks a position as a don't-care when the side to move has a
// capture, because the search resolves those nodes itself and never
// probes them. If `hasCapture` and the generator ever disagreed, the
// packer would fill an entry the search does read, so they are compared
// here over random placements.
func TestHasCaptureAgreesWithTheGenerator(t *testing.T) {
	rng := rand.New(rand.NewSource(5))
	g := &Gen{}
	seen := 0
	for n := 0; n < 200000; n++ {
		pieces := 2 + rng.Intn(6)
		var w, b, k uint32
		placed := 0
		for placed < pieces {
			sq := rng.Intn(32)
			bit := uint32(1) << uint(sq)
			if (w|b)&bit != 0 {
				continue
			}
			king := rng.Intn(100) < 40
			if placed%2 == 0 {
				if !king && bit&rank8 != 0 {
					continue
				}
				w |= bit
			} else {
				if !king && bit&rank1 != 0 {
					continue
				}
				b |= bit
			}
			if king {
				k |= bit
			}
			placed++
		}
		if w == 0 || b == 0 {
			continue
		}
		moves := g.Successors(w, b, k, white)
		// The list is all captures or all quiet moves, and only a capture
		// takes an enemy piece off the board.
		captures := len(moves) > 0 &&
			bits.OnesCount32(moves[0].B) < bits.OnesCount32(b)
		if got := hasCapture(w, b, k); got != captures {
			t.Fatalf("%s: hasCapture = %v, generator says %v",
				formatPos(w, b, k, white), got, captures)
		}
		if captures {
			seen++
		}
	}
	if seen < 1000 {
		t.Fatalf("only %d capture positions in the sample", seen)
	}
}
