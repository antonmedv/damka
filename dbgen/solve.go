package main

import (
	"fmt"
	"math/bits"
	"sort"
	"sync"
	"sync/atomic"
)

// Value of one stored position, always with white to move.
//
//	0          draw under every counter state
//	1 .. 30    win, needs a draw-counter budget of at least this many plies
//	32 .. 62   loss, value-32 is the budget the loss needs
//
// The budget is 30 - plies, the number of quiet king plies still allowed
// by RULES.md before the game is drawn. A position is therefore read
// against the counter it is probed with: a win in 12 is a win while the
// counter is at most 18 and a draw after that. Both sets grow with the
// budget (more allowed plies never hurt the side that can force the
// result), so one threshold per position is enough.
const (
	valDraw   = 0
	lossBase  = 32
	maxBudget = 30
)

// outcome of a stored value at a given budget: 1 win, -1 loss, 0 draw.
func outcome(v byte, budget int) int {
	if v == valDraw {
		return 0
	}
	if v < lossBase {
		if int(v) <= budget {
			return 1
		}
		return 0
	}
	if int(v)-lossBase <= budget {
		return -1
	}
	return 0
}

// DB holds one table per slice, indexed by the slice's layout.
type DB struct {
	tables  map[Slice][]byte
	layouts map[Slice]layout
	max     int
	// One solver per worker; they never share state.
	solvers []*unitSolver
}

func newDB(max, workers int) *DB {
	if workers < 1 {
		workers = 1
	}
	db := &DB{
		tables:  map[Slice][]byte{},
		layouts: map[Slice]layout{},
		max:     max,
		solvers: make([]*unitSolver, workers),
	}
	for i := range db.solvers {
		db.solvers[i] = &unitSolver{db: db, gen: &Gen{}}
	}
	return db
}

// valueOf reads a white-to-move position from the solved tables.
func (db *DB) valueOf(w, b, k uint32) byte {
	if w == 0 {
		// The side to move has no pieces: it lost before the draw rule.
		return lossBase
	}
	s := sliceOf(w, b, k)
	tab, ok := db.tables[s]
	if !ok {
		panic(fmt.Sprintf("slice %v not solved", s))
	}
	l := db.layouts[s]
	return tab[l.index(w, b, k)]
}

// slicesUpTo lists every material class of at most max pieces with both
// sides still on the board, in the order they have to be solved: fewer
// pieces first (a capture leaves the slice downwards), then fewer men
// (a promotion turns a man into a king).
func slicesUpTo(max int) []Slice {
	var out []Slice
	for wm := 0; wm <= max; wm++ {
		for wk := 0; wm+wk <= max; wk++ {
			for bm := 0; wm+wk+bm <= max; bm++ {
				for bk := 0; wm+wk+bm+bk <= max; bk++ {
					s := Slice{wm, wk, bm, bk}
					if s.WM+s.WK == 0 || s.BM+s.BK == 0 {
						continue
					}
					out = append(out, s)
				}
			}
		}
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Pieces() != b.Pieces() {
			return a.Pieces() < b.Pieces()
		}
		if a.Men() != b.Men() {
			return a.Men() < b.Men()
		}
		return fmt.Sprint(a) < fmt.Sprint(b)
	})
	return out
}

// Solve fills every table up to db.max pieces.
func (db *DB) Solve(progress func(Slice, int)) {
	done := map[Slice]bool{}
	for _, s := range slicesUpTo(db.max) {
		if done[s] {
			continue
		}
		t := s.Swap()
		db.alloc(s)
		db.alloc(t)
		n := db.solvePair(s, t)
		done[s], done[t] = true, true
		if progress != nil {
			progress(s, n)
		}
	}
}

func (db *DB) alloc(s Slice) {
	if _, ok := db.tables[s]; ok {
		return
	}
	l := newLayout(s)
	db.layouts[s] = l
	db.tables[s] = make([]byte, l.size)
}

// advancement is the number of quiet man moves already made by both
// sides: every non-capturing man move raises it by one, so a man move
// always leaves the current group for one that is already solved.
func advancement(wMen, bMen uint32) int {
	p := 0
	for rest := wMen; rest != 0; rest &= rest - 1 {
		p += bits.TrailingZeros32(rest) >> 2
	}
	for rest := bMen; rest != 0; rest &= rest - 1 {
		p += 7 - bits.TrailingZeros32(rest)>>2
	}
	return p
}

// group is one man placement and its mirror: the positions that quiet
// king moves connect. Ranges a and b are contiguous blocks of king
// placements, a in slice s and b in slice s.Swap().
type group struct {
	baseA, baseB uint64
	same         bool
	advance      int
}

// solvePair solves the slice s together with its mirror t; returns the
// number of positions solved.
//
// Groups whose men stand equally far advanced never reach one another: a
// quiet man move is the only move that stays inside the slice and resets
// the counter, and it always advances a man by one. A whole layer of
// groups can therefore be solved at once. A slice without men is one
// group holding every king placement, so there the work inside the group
// is split instead.
func (db *DB) solvePair(s, t Slice) int {
	layA, layB := db.layouts[s], db.layouts[t]
	tabA, tabB := db.tables[s], db.tables[t]

	groups := db.groups(s, t, layA, layB)
	// Later man placements first: a quiet man move only ever goes forward.
	sort.Slice(groups, func(i, j int) bool {
		return groups[i].advance > groups[j].advance
	})

	total := 0
	for from := 0; from < len(groups); {
		to := from
		for to < len(groups) && groups[to].advance == groups[from].advance {
			to++
		}
		total += db.solveLayer(layA, layB, tabA, tabB, groups[from:to])
		from = to
	}
	return total
}

// solveLayer solves groups that cannot see each other, in parallel.
func (db *DB) solveLayer(layA, layB layout, tabA, tabB []byte, layer []group) int {
	workers := len(db.solvers)
	if len(layer) < workers {
		total := 0
		for _, grp := range layer {
			total += db.solveWide(layA, layB, tabA, tabB, grp)
		}
		return total
	}
	var next atomic.Int64
	var wg sync.WaitGroup
	counts := make([]int, workers)
	for w := range db.solvers {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			solver := db.solvers[w]
			for {
				i := int(next.Add(1)) - 1
				if i >= len(layer) {
					return
				}
				counts[w] += solver.solve(layA, layB, tabA, tabB, layer[i])
			}
		}(w)
	}
	wg.Wait()
	total := 0
	for _, c := range counts {
		total += c
	}
	return total
}

// solveWide solves one group with every worker on it: the classification
// pass, which generates the moves of every position, is split into one
// range per worker. The budget sweep that follows is cheap by comparison
// and stays on one.
func (db *DB) solveWide(layA, layB layout, tabA, tabB []byte, grp group) int {
	primary := db.solvers[0]
	nA, n := groupSize(layA, layB, grp)
	primary.reset(n)
	job := &classifyJob{data: primary, layA: layA, layB: layB, grp: grp, nA: nA}
	workers := db.solvers
	if n < len(workers) {
		workers = workers[:1]
	}
	var wg sync.WaitGroup
	for c, worker := range workers {
		from := n * c / len(workers)
		to := n * (c + 1) / len(workers)
		wg.Add(1)
		go func(worker *unitSolver, from, to int) {
			defer wg.Done()
			worker.classify(job, from, to)
		}(worker, from, to)
	}
	wg.Wait()
	primary.merge(workers)
	primary.sweep(n, len(workers))
	primary.writeBack(layA, layB, tabA, tabB, grp, nA, n)
	return n
}

// groups enumerates every man placement of s, paired with its mirror in t.
func (db *DB) groups(s, t Slice, layA, layB layout) []group {
	var out []group
	seen := map[[2]uint64]bool{}
	for wm := uint64(0); wm < layA.nwm; wm++ {
		wMen := whiteMenDomain.unrank(wm, s.WM)
		for bm := uint64(0); bm < layA.nbm; bm++ {
			bMen := blackMenDomain.unrank(bm, s.BM)
			if wMen&bMen != 0 {
				continue
			}
			baseA := (wm*layA.nbm + bm) * layA.kings
			// The mirror swaps colours and turns the board.
			mw, mb := mirrorBits(bMen), mirrorBits(wMen)
			baseB := (whiteMenDomain.rank(mw, t.WM)*layB.nbm +
				blackMenDomain.rank(mb, t.BM)) * layB.kings
			if s == t {
				key := [2]uint64{baseA, baseB}
				if baseB < baseA {
					key = [2]uint64{baseB, baseA}
				}
				if seen[key] {
					continue
				}
				seen[key] = true
			}
			out = append(out, group{
				baseA:   baseA,
				baseB:   baseB,
				same:    s == t && baseA == baseB,
				advance: advancement(wMen, bMen),
			})
		}
	}
	return out
}

// unitSolver solves one group: all king placements over a fixed man
// placement, for both sides to move. There is one per worker, and none of
// its state is shared.
type unitSolver struct {
	db  *DB
	gen *Gen

	extWin []bool
	extAll []bool
	start  []uint32
	edges  []uint32
	vals   []byte

	// Filled by `classify` for one range of positions, then merged.
	chunkStart []uint32
	chunkEdges []uint32
	// The values as the last budget left them, read while the next one
	// is written, so workers sweeping the same group never race.
	prev []byte
}

// classifyJob is one group being classified, shared by the workers that
// split it. Only `data` is written, and only at indices inside the range
// a worker was given.
type classifyJob struct {
	data       *unitSolver
	layA, layB layout
	grp        group
	nA         int
}

// groupSize is the number of positions of a group, and how many of them
// belong to the first of the two slices.
func groupSize(layA, layB layout, grp group) (nA, n int) {
	nA = int(layA.kings)
	nB := int(layB.kings)
	if grp.same {
		nB = 0
	}
	return nA, nA + nB
}

// solve is one group on one worker, start to finish.
func (u *unitSolver) solve(layA, layB layout, tabA, tabB []byte, grp group) int {
	nA, n := groupSize(layA, layB, grp)
	u.reset(n)
	u.classify(&classifyJob{data: u, layA: layA, layB: layB, grp: grp, nA: nA}, 0, n)
	u.merge([]*unitSolver{u})
	u.sweep(n, 1)
	u.writeBack(layA, layB, tabA, tabB, grp, nA, n)
	return n
}

// classify decodes the positions in [from, to) and sorts their moves:
// quiet king moves stay inside the group and become edges, everything
// else - a capture or a man move - resets the counter and lands in a
// table that is already final, so it is read once and folded into the
// two flags.
func (u *unitSolver) classify(job *classifyJob, from, to int) {
	d := job.data
	layA, layB, grp, nA := job.layA, job.layB, job.grp, job.nA
	starts := u.chunkStart[:0]
	edges := u.chunkEdges[:0]
	for i := from; i < to; i++ {
		starts = append(starts, uint32(len(edges)))
		var w, b, k uint32
		var ok bool
		if i < nA {
			w, b, k, ok = layA.position(grp.baseA + uint64(i))
		} else {
			w, b, k, ok = layB.position(grp.baseB + uint64(i-nA))
		}
		if !ok {
			continue
		}
		moves := u.gen.Successors(w, b, k, white)
		if len(moves) == 0 {
			d.vals[i] = lossBase // no moves: lost before the draw rule
			continue
		}
		extCount, extWins := 0, 0
		for _, m := range moves {
			cw, cb, ck := mirror(m.W, m.B, m.K)
			if m.Zero {
				extCount++
				switch outcome(u.db.valueOf(cw, cb, ck), maxBudget) {
				case -1:
					d.extWin[i] = true
				case 1:
					extWins++
				}
				continue
			}
			var local int
			if i < nA {
				local = nA + int(layB.index(cw, cb, ck)-grp.baseB)
				if grp.same {
					local -= nA
				}
			} else {
				local = int(layA.index(cw, cb, ck) - grp.baseA)
			}
			edges = append(edges, uint32(local))
		}
		// With no zeroing move at all every one of them is a win, vacuously.
		d.extAll[i] = extWins == extCount
	}
	u.chunkStart, u.chunkEdges = starts, edges
}

// merge joins what the workers classified into one edge list, in order.
func (u *unitSolver) merge(workers []*unitSolver) {
	if len(workers) == 1 {
		// The one worker wrote the whole group: take its buffers.
		u.start, u.chunkStart = u.chunkStart, u.start
		u.edges, u.chunkEdges = u.chunkEdges, u.edges
		u.start = append(u.start, uint32(len(u.edges)))
		return
	}
	u.start = u.start[:0]
	u.edges = u.edges[:0]
	for _, w := range workers {
		base := uint32(len(u.edges))
		for _, s := range w.chunkStart {
			u.start = append(u.start, s+base)
		}
		u.edges = append(u.edges, w.chunkEdges...)
	}
	u.start = append(u.start, uint32(len(u.edges)))
}

// sweep settles the group budget by budget: a position is a win at
// budget b when some move wins at once (the counter resets) or leaves the
// opponent lost at b-1, and a loss when every move leaves the opponent
// winning. Every budget reads the values the one before it left, so the
// positions of a budget are independent and `workers` of them can run at
// once.
func (u *unitSolver) sweep(n, workers int) {
	u.prev = resizeBytes(u.prev, n)
	for b := 1; b <= maxBudget; b++ {
		copy(u.prev, u.vals)
		if workers <= 1 {
			u.sweepRange(0, n, b)
			continue
		}
		var wg sync.WaitGroup
		for c := 0; c < workers; c++ {
			wg.Add(1)
			go func(from, to int) {
				defer wg.Done()
				u.sweepRange(from, to, b)
			}(n*c/workers, n*(c+1)/workers)
		}
		wg.Wait()
	}
}

func (u *unitSolver) sweepRange(from, to, b int) {
	for i := from; i < to; i++ {
		if u.prev[i] != valDraw {
			continue
		}
		win := u.extWin[i]
		allWin := u.extAll[i]
		if !win {
			for _, c := range u.edges[u.start[i]:u.start[i+1]] {
				switch outcome(u.prev[c], b-1) {
				case -1:
					win = true
				case 1:
				default:
					allWin = false
				}
				if win {
					break
				}
			}
		}
		if win {
			u.vals[i] = byte(b)
		} else if allWin {
			u.vals[i] = byte(lossBase + b)
		}
	}
}

func (u *unitSolver) writeBack(
	layA, layB layout,
	tabA, tabB []byte,
	grp group,
	nA, n int,
) {
	for i := 0; i < nA; i++ {
		tabA[grp.baseA+uint64(i)] = u.vals[i]
	}
	for i := nA; i < n; i++ {
		tabB[grp.baseB+uint64(i-nA)] = u.vals[i]
	}
}

func (u *unitSolver) reset(n int) {
	u.extWin = resizeBool(u.extWin, n)
	u.extAll = resizeBool(u.extAll, n)
	u.vals = resizeBytes(u.vals, n)
	u.start = u.start[:0]
	u.edges = u.edges[:0]
}

func resizeBool(s []bool, n int) []bool {
	if cap(s) < n {
		return make([]bool, n)
	}
	s = s[:n]
	for i := range s {
		s[i] = false
	}
	return s
}

func resizeBytes(s []byte, n int) []byte {
	if cap(s) < n {
		return make([]byte, n)
	}
	s = s[:n]
	for i := range s {
		s[i] = 0
	}
	return s
}
