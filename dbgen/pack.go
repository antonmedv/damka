package main

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"sort"
)

// measure reports how small the solved tables can get. Three streams are
// compared, all over the same index space:
//
//	value  the stored byte, 61 symbols (draw, win in b, loss in b)
//	wdl    two bits, the value at a full 30-ply budget
//	runs   either stream after don't-care merging
//
// A position is a don't-care when the index is a hole (two pieces on one
// square) or when the side to move has a capture: captures are mandatory,
// so the search resolves those nodes itself and never probes them. The
// packer is free to give a don't-care whatever value lengthens a run.
func measure(db *DB) {
	g := &Gen{}
	var total, holes, captures uint64
	hist := map[byte]uint64{}

	valueRuns, wdlRuns := uint64(0), uint64(0)
	valueBytes, wdlBytes := uint64(0), uint64(0)
	var rawValue, rawWDL bytes.Buffer

	slices := make([]Slice, 0, len(db.tables))
	for s := range db.tables {
		slices = append(slices, s)
	}
	sort.Slice(slices, func(i, j int) bool { return fmt.Sprint(slices[i]) < fmt.Sprint(slices[j]) })

	for _, s := range slices {
		tab := db.tables[s]
		l := db.layouts[s]
		care := make([]bool, len(tab))
		vals := make([]byte, len(tab))
		wdl := make([]byte, len(tab))
		for i := range tab {
			total++
			w, b, k, ok := l.position(uint64(i))
			if !ok {
				holes++
				continue
			}
			v := tab[i]
			hist[v]++
			// Mandatory captures are resolved by the search, never probed.
			if moves := g.Successors(w, b, k, white); len(moves) > 0 && moves[0].Zero && hasCapture(w, b, k) {
				captures++
				continue
			}
			care[i] = true
			vals[i] = v
			switch {
			case v == valDraw:
				wdl[i] = 0
			case v < lossBase:
				wdl[i] = 1
			default:
				wdl[i] = 2
			}
		}
		vr, vb := runStats(vals, care)
		wr, wb := runStats(wdl, care)
		valueRuns += vr
		valueBytes += vb
		wdlRuns += wr
		wdlBytes += wb
		fillDontCare(vals, care)
		fillDontCare(wdl, care)
		rawValue.Write(vals)
		rawWDL.Write(packTwoBit(wdl))
	}

	fmt.Printf("\nindex slots %d: holes %.1f%%, capture nodes %.1f%%, probed %.1f%%\n",
		total, pct(holes, total), pct(captures, total),
		pct(total-holes-captures, total))
	fmt.Printf("value stream: %d runs, %.1f MB as varint runs\n", valueRuns, float64(valueBytes)/1e6)
	fmt.Printf("wdl   stream: %d runs, %.1f MB as varint runs\n", wdlRuns, float64(wdlBytes)/1e6)
	fmt.Printf("raw byte per position: %.1f MB, gzip %.1f MB\n",
		float64(rawValue.Len())/1e6, float64(gzipLen(rawValue.Bytes()))/1e6)
	fmt.Printf("raw two bits per position: %.1f MB, gzip %.1f MB\n",
		float64(rawWDL.Len())/1e6, float64(gzipLen(rawWDL.Bytes()))/1e6)

	fmt.Println("\nvalue histogram (share of probed positions):")
	keys := make([]int, 0, len(hist))
	for v := range hist {
		keys = append(keys, int(v))
	}
	sort.Ints(keys)
	for _, v := range keys {
		fmt.Printf("  %-28s %8.3f%%\n", describe(byte(v)), pct(hist[byte(v)], total-holes))
	}
}

// hasCapture reports whether white has a capture in this position.
func hasCapture(w, b, k uint32) bool {
	occupied := w | b
	empty := ^occupied
	men := w &^ k
	if (downRight(downRight(empty)&b)|downLeft(downLeft(empty)&b)|
		upRight(upRight(empty)&b)|upLeft(upLeft(empty)&b))&men != 0 {
		return true
	}
	g := &Gen{occupied: occupied, enemy: b}
	for rest := w & k; rest != 0; rest &= rest - 1 {
		one := rest & -rest
		g.occupied = occupied &^ one
		if g.kingCanCapture(one, 0) {
			return true
		}
	}
	return false
}

// runStats counts the runs left after don't-care merging and the bytes a
// varint run encoding would take (one byte of value, one to three of length).
func runStats(vals []byte, care []bool) (runs, size uint64) {
	started := false
	var cur byte
	for i := range vals {
		if !care[i] {
			continue
		}
		if !started || vals[i] != cur {
			runs++
			size += 2 // value byte plus one length byte
			cur = vals[i]
			started = true
		}
	}
	// Runs longer than 127 need another length byte; charge one per 16k.
	size += uint64(len(vals)) / 16384
	return runs, size
}

func fillDontCare(vals []byte, care []bool) {
	var cur byte
	for i := range vals {
		if care[i] {
			cur = vals[i]
		} else {
			vals[i] = cur
		}
	}
}

func packTwoBit(v []byte) []byte {
	out := make([]byte, (len(v)+3)/4)
	for i, x := range v {
		out[i>>2] |= (x & 3) << uint((i&3)*2)
	}
	return out
}

func gzipLen(data []byte) int {
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	_, _ = zw.Write(data)
	_ = zw.Close()
	return buf.Len()
}
