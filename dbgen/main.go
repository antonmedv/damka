// Command dbgen builds the endgame database for Damka.
//
//	go run . stats -max 6      slice sizes, before any solving
//	go run . solve -max 4      solve and report; -check adds verification
package main

import (
	"flag"
	"fmt"
	"os"
	"runtime"
	"time"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: dbgen <stats|solve> [flags]")
		os.Exit(2)
	}
	fs := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	max := fs.Int("max", 4, "maximum number of pieces")
	check := fs.Bool("check", false, "verify the tables after solving")
	pack := fs.Bool("pack", false, "report how small the tables compress")
	out := fs.String("out", "", "directory to write the packed tables to")
	blockShift := fs.Int("block", 11, "positions per block, as a power of two")
	dumpN := fs.Int("dump", 0, "print this many random positions with their verdict")
	seed := fs.Int64("seed", 1, "seed for -dump")
	jobs := fs.Int("j", runtime.NumCPU(), "workers solving in parallel")
	_ = fs.Parse(os.Args[2:])

	switch os.Args[1] {
	case "stats":
		stats(*max)
	case "solve":
		db := solve(*max, *jobs)
		if *check {
			if err := verify(db); err != nil {
				// Nothing is written: tables that fail their own check
				// must not reach a build.
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
		}
		if *pack {
			measure(db)
		}
		if *dumpN > 0 {
			dump(db, *dumpN, *seed)
		}
		if *out != "" {
			if err := build(db, *out, *blockShift); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", os.Args[1])
		os.Exit(2)
	}
}

func stats(max int) {
	var slots uint64
	for _, s := range slicesUpTo(max) {
		slots += newLayout(s).size
	}
	fmt.Printf("slices: %d\n", len(slicesUpTo(max)))
	fmt.Printf("index slots (with holes): %d (%.1f MB at one byte each)\n",
		slots, float64(slots)/1e6)
}

func solve(max, jobs int) *DB {
	db := newDB(max, jobs)
	start := time.Now()
	last := start
	db.Solve(func(s Slice, n int) {
		now := time.Now()
		fmt.Printf("  %-10v %10d positions  %6.2fs  (%6.2fs total)\n",
			s, n, now.Sub(last).Seconds(), now.Sub(start).Seconds())
		last = now
	})
	fmt.Printf("solved <=%d pieces in %.1fs on %d workers\n",
		max, time.Since(start).Seconds(), jobs)
	var draws, wins, losses, holes uint64
	for s, tab := range db.tables {
		l := db.layouts[s]
		for i, v := range tab {
			if _, _, _, ok := l.position(uint64(i)); !ok {
				holes++
				continue
			}
			switch {
			case v == valDraw:
				draws++
			case v < lossBase:
				wins++
			default:
				losses++
			}
		}
	}
	total := draws + wins + losses
	fmt.Printf("positions %d: %.1f%% win, %.1f%% loss, %.1f%% draw; holes %d (%.1f%%)\n",
		total, pct(wins, total), pct(losses, total), pct(draws, total),
		holes, pct(holes, total+holes))
	return db
}

func pct(a, b uint64) float64 {
	if b == 0 {
		return 0
	}
	return 100 * float64(a) / float64(b)
}
