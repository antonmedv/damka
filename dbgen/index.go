package main

import "math/bits"

// Material class of a position with WHITE TO MOVE. Only white-to-move
// positions are stored: a black-to-move position is mirrored (board
// turned 180 degrees, colours swapped), which halves the database.
type Slice struct{ WM, WK, BM, BK int }

func (s Slice) Pieces() int { return s.WM + s.WK + s.BM + s.BK }
func (s Slice) Men() int    { return s.WM + s.BM }

// Swap is the slice a mirrored position of this slice belongs to.
func (s Slice) Swap() Slice { return Slice{s.BM, s.BK, s.WM, s.WK} }

func (s Slice) String() string {
	return string([]byte{
		'0' + byte(s.WM), 'm', '0' + byte(s.WK), 'k',
		'v', '0' + byte(s.BM), 'm', '0' + byte(s.BK), 'k',
	})
}

// Squares a piece type may stand on. A man never stands on its promotion
// rank, so the two man domains hold 28 squares each.
var (
	whiteMenDomain = newDomain(^rank8)
	blackMenDomain = newDomain(^rank1)
	kingDomain     = newDomain(0xffffffff)
)

// A domain is the set of squares one piece type may occupy, with the
// mapping between a square and its ordinal inside the set.
type domain struct {
	mask uint32
	n    int
	ord  [32]uint8 // square -> ordinal within the domain
	sq   [32]uint8 // ordinal -> square
}

func newDomain(mask uint32) *domain {
	d := &domain{mask: mask}
	for sq := 0; sq < 32; sq++ {
		if mask&(1<<uint(sq)) != 0 {
			d.ord[sq] = uint8(d.n)
			d.sq[d.n] = uint8(sq)
			d.n++
		}
	}
	return d
}

var binom [33][33]uint64

func init() {
	for n := 0; n < 33; n++ {
		binom[n][0] = 1
		for k := 1; k <= n; k++ {
			binom[n][k] = binom[n-1][k-1] + binom[n-1][k]
		}
	}
}

func choose(n, k int) uint64 {
	if k < 0 || n < 0 || k > n {
		return 0
	}
	return binom[n][k]
}

// rank is the colexicographic rank of the k squares of sub within the
// domain, in 0 .. choose(d.n, k)-1. Every bit of sub must be in the domain.
func (d *domain) rank(sub uint32, k int) uint64 {
	var r uint64
	i := 1
	for rest := sub; rest != 0; rest &= rest - 1 {
		sq := bits.TrailingZeros32(rest)
		r += choose(int(d.ord[sq]), i)
		i++
	}
	return r
}

// unrank is the inverse of rank.
func (d *domain) unrank(r uint64, k int) uint32 {
	var sub uint32
	for i := k; i >= 1; i-- {
		// Largest ordinal o with choose(o, i) <= r.
		o := i - 1
		for choose(o+1, i) <= r {
			o++
		}
		r -= choose(o, i)
		sub |= 1 << uint(d.sq[o])
	}
	return sub
}

// The index of a position is mixed radix over four ranks, men first:
//
//	((wmRank*BM + bmRank)*WK + wkRank)*BK + bkRank
//
// so every position that shares a man placement is contiguous, and king
// moves only ever change the low digits. Kings are ranked over all 32
// squares and men over their 28, ignoring the squares the other pieces
// take, so some indices describe overlapping placements. Those holes are
// never probed and become don't-care values when the table is packed;
// they buy a fixed stride, which keeps indexing branch-free.
type layout struct {
	slice    Slice
	nwm, nbm uint64 // number of man placements per colour
	nwk, nbk uint64 // number of king placements per colour
	kings    uint64 // nwk * nbk, the size of one man placement group
	size     uint64
}

func newLayout(s Slice) layout {
	l := layout{slice: s}
	l.nwm = choose(whiteMenDomain.n, s.WM)
	l.nbm = choose(blackMenDomain.n, s.BM)
	l.nwk = choose(kingDomain.n, s.WK)
	l.nbk = choose(kingDomain.n, s.BK)
	l.kings = l.nwk * l.nbk
	l.size = l.nwm * l.nbm * l.kings
	return l
}

// index of a white-to-move position of this slice.
func (l *layout) index(w, b, k uint32) uint64 {
	wm := whiteMenDomain.rank(w&^k, l.slice.WM)
	bm := blackMenDomain.rank(b&^k, l.slice.BM)
	wk := kingDomain.rank(w&k, l.slice.WK)
	bk := kingDomain.rank(b&k, l.slice.BK)
	return ((wm*l.nbm+bm)*l.nwk+wk)*l.nbk + bk
}

// position of an index. ok is false when the index is a hole: two pieces
// would share a square.
func (l *layout) position(idx uint64) (w, b, k uint32, ok bool) {
	bk := idx % l.nbk
	idx /= l.nbk
	wk := idx % l.nwk
	idx /= l.nwk
	bm := idx % l.nbm
	wm := idx / l.nbm
	wMen := whiteMenDomain.unrank(wm, l.slice.WM)
	bMen := blackMenDomain.unrank(bm, l.slice.BM)
	wKings := kingDomain.unrank(wk, l.slice.WK)
	bKings := kingDomain.unrank(bk, l.slice.BK)
	all := wMen | bMen | wKings | bKings
	n := bits.OnesCount32(wMen) + bits.OnesCount32(bMen) +
		bits.OnesCount32(wKings) + bits.OnesCount32(bKings)
	if bits.OnesCount32(all) != n {
		return 0, 0, 0, false
	}
	return wMen | wKings, bMen | bKings, wKings | bKings, true
}

// sliceOf is the slice a white-to-move position belongs to.
func sliceOf(w, b, k uint32) Slice {
	return Slice{
		WM: bits.OnesCount32(w &^ k),
		WK: bits.OnesCount32(w & k),
		BM: bits.OnesCount32(b &^ k),
		BK: bits.OnesCount32(b & k),
	}
}

// mirror turns a black-to-move position into the white-to-move position
// that stands for it in the database.
func mirror(w, b, k uint32) (uint32, uint32, uint32) {
	return mirrorBits(b), mirrorBits(w), mirrorBits(k)
}
