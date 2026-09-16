package main

import "math/bits"

// Succ is the position after one legal move, with the side to move
// flipped at the caller (the generator never stores a side in Succ).
type Succ struct {
	W, B, K uint32
	// Zero reports a capture or a man move: the 30-ply draw counter resets.
	Zero bool
}

// Gen generates successors. One Gen per goroutine: the whole capture
// search lives in its fields, so two of them never share state.
type Gen struct {
	out []Succ

	w, b, k uint32
	side    int
	// Every piece except the moving one's origin, fixed for a sequence.
	occupied uint32
	enemy    uint32
	origin   uint32 // bit of the origin square
	promo    uint32 // promotion rank of the side to move
	wasKing  bool
	dedupe   bool
}

// Successors returns every position reachable by one legal move, one
// entry per outcome: capture sequences that take the same pieces and end
// on the same square are one move. Captures are mandatory, so the list is
// either all captures or all quiet moves. The slice is reused by the next
// call.
func (g *Gen) Successors(w, b, k uint32, side int) []Succ {
	g.out = g.out[:0]
	g.w, g.b, g.k, g.side = w, b, k, side
	own, enemy := w, b
	promo := rank8
	if side == black {
		own, enemy = b, w
		promo = rank1
	}
	occupied := w | b
	empty := ^occupied
	men := own &^ k
	ownKings := own & k
	g.enemy = enemy
	g.promo = promo

	// Men that can capture: walk two steps back from every empty square.
	g.dedupe = true
	candidates := (downRight(downRight(empty)&enemy) |
		downLeft(downLeft(empty)&enemy) |
		upRight(upRight(empty)&enemy) |
		upLeft(upLeft(empty)&enemy)) & men
	for rest := candidates; rest != 0; rest &= rest - 1 {
		one := rest & -rest
		g.origin, g.wasKing, g.occupied = one, false, occupied&^one
		g.manCaptures(one, 0, 0)
	}
	for rest := ownKings; rest != 0; rest &= rest - 1 {
		one := rest & -rest
		g.origin, g.wasKing, g.occupied = one, true, occupied&^one
		g.kingCaptures(one, 0, 0, false)
	}
	if len(g.out) > 0 {
		return g.out
	}

	// Quiet man moves, one direction at a time; the origin is one step back.
	g.dedupe = false
	g.wasKing = false
	if side == white {
		for t := upLeft(men) & empty; t != 0; t &= t - 1 {
			one := t & -t
			g.origin = downRight(one)
			g.emit(one, one&rank8 != 0, 0)
		}
		for t := upRight(men) & empty; t != 0; t &= t - 1 {
			one := t & -t
			g.origin = downLeft(one)
			g.emit(one, one&rank8 != 0, 0)
		}
	} else {
		for t := downLeft(men) & empty; t != 0; t &= t - 1 {
			one := t & -t
			g.origin = upRight(one)
			g.emit(one, one&rank1 != 0, 0)
		}
		for t := downRight(men) & empty; t != 0; t &= t - 1 {
			one := t & -t
			g.origin = upLeft(one)
			g.emit(one, one&rank1 != 0, 0)
		}
	}

	// Quiet king moves: the ray up to (excluding) the first blocker.
	g.wasKing = true
	for rest := ownKings; rest != 0; rest &= rest - 1 {
		one := rest & -rest
		sq := bits.TrailingZeros32(one)
		g.origin = one
		for dir := 0; dir < 4; dir++ {
			ray := rays[dir<<5|sq]
			targets := ray
			if blockers := ray & occupied; blockers != 0 {
				first := nearest(blockers, dir)
				targets = ray &^ first &^ rays[dir<<5|bits.TrailingZeros32(first)]
			}
			for t := targets; t != 0; t &= t - 1 {
				g.emit(t&-t, false, 0)
			}
		}
	}
	return g.out
}

// manCaptures continues a man's capture sequence from square bit b with
// captured pieces already taken. A man that lands on the back rank
// continues at once as a king.
func (g *Gen) manCaptures(b, captured uint32, depth int) {
	capturable := g.enemy &^ captured
	empty := ^g.occupied
	continued := false
	if mid := upLeft(b) & capturable; mid != 0 {
		if land := upLeft(mid) & empty; land != 0 {
			continued = true
			g.landAfterMan(mid, land, captured, depth)
		}
	}
	if mid := upRight(b) & capturable; mid != 0 {
		if land := upRight(mid) & empty; land != 0 {
			continued = true
			g.landAfterMan(mid, land, captured, depth)
		}
	}
	if mid := downLeft(b) & capturable; mid != 0 {
		if land := downLeft(mid) & empty; land != 0 {
			continued = true
			g.landAfterMan(mid, land, captured, depth)
		}
	}
	if mid := downRight(b) & capturable; mid != 0 {
		if land := downRight(mid) & empty; land != 0 {
			continued = true
			g.landAfterMan(mid, land, captured, depth)
		}
	}
	if !continued && depth > 0 {
		g.emit(b, false, captured)
	}
}

func (g *Gen) landAfterMan(mid, land, captured uint32, depth int) {
	if land&g.promo != 0 {
		g.kingCaptures(land, captured|mid, depth+1, true)
	} else {
		g.manCaptures(land, captured|mid, depth+1)
	}
}

// kingCaptures continues a king's capture sequence. Per direction: the
// first piece on the ray must be capturable and have empty squares
// behind it. If the king can keep capturing from some of those squares it
// must land on one of them; otherwise each of them ends the move.
func (g *Gen) kingCaptures(b, captured uint32, depth int, promotes bool) {
	sq := bits.TrailingZeros32(b)
	capturable := g.enemy &^ captured
	continued := false
	for dir := 0; dir < 4; dir++ {
		blockers := rays[dir<<5|sq] & g.occupied
		if blockers == 0 {
			continue
		}
		first := nearest(blockers, dir)
		if first&capturable == 0 {
			continue
		}
		beyond := rays[dir<<5|bits.TrailingZeros32(first)]
		landings := beyond
		if blockers2 := beyond & g.occupied; blockers2 != 0 {
			second := nearest(blockers2, dir)
			landings = beyond &^ second &^ rays[dir<<5|bits.TrailingZeros32(second)]
		}
		if landings == 0 {
			continue
		}
		continued = true
		now := captured | first
		var continuing uint32
		for rest := landings; rest != 0; rest &= rest - 1 {
			one := rest & -rest
			if g.kingCanCapture(one, now) {
				continuing |= one
			}
		}
		if continuing != 0 {
			for rest := continuing; rest != 0; rest &= rest - 1 {
				g.kingCaptures(rest&-rest, now, depth+1, promotes)
			}
		} else {
			for rest := landings; rest != 0; rest &= rest - 1 {
				g.emit(rest&-rest, promotes, now)
			}
		}
	}
	if !continued && depth > 0 {
		g.emit(b, promotes, captured)
	}
}

// kingCanCapture reports whether a king on square bit b still has a capture.
func (g *Gen) kingCanCapture(b, captured uint32) bool {
	sq := bits.TrailingZeros32(b)
	capturable := g.enemy &^ captured
	for dir := 0; dir < 4; dir++ {
		blockers := rays[dir<<5|sq] & g.occupied
		if blockers == 0 {
			continue
		}
		first := nearest(blockers, dir)
		if first&capturable == 0 {
			continue
		}
		// The square right behind the piece is the nearest one on its ray.
		beyond := rays[dir<<5|bits.TrailingZeros32(first)]
		if beyond != 0 && nearest(beyond, dir)&g.occupied == 0 {
			return true
		}
	}
	return false
}

// emit records the position after a complete move onto square bit to.
func (g *Gen) emit(to uint32, promotes bool, captured uint32) {
	k := g.k &^ g.origin &^ captured
	if g.wasKing || promotes {
		k |= to
	}
	s := Succ{K: k, Zero: captured != 0 || !g.wasKing}
	if g.side == white {
		s.W = (g.w ^ g.origin) | to
		s.B = g.b &^ captured
	} else {
		s.W = g.w &^ captured
		s.B = (g.b ^ g.origin) | to
	}
	if g.dedupe {
		for i := range g.out {
			if g.out[i] == s {
				return
			}
		}
	}
	g.out = append(g.out, s)
}
