package main

import (
	"bytes"
	"compress/flate"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
)

// The shipped format: one file per slice plus a manifest, so the browser
// fetches only the material it actually reaches.
//
// A slice file is a header, a block offset table and the blocks:
//
//	magic       "DKB1"
//	slice       wm | wk<<8 | bm<<16 | bk<<24
//	size        index slots in the slice
//	blockShift  positions per block = 1 << blockShift
//	blocks      number of blocks
//	offsets     blocks+1 uint32, relative to the first block
//	data        each block raw deflate over one byte per position
//
// Blocks are independent, so a probe inflates one block (a few KB) and
// keeps it in a small cache; nothing else has to be in memory. Small
// blocks cost wire size and save decoding: at 2^11 positions the
// five-piece set is 12.1 MB rather than 10.0 MB, and a search that
// evicts blocks wastes a quarter of the work it would at 2^13. Values of
// positions that are never probed - holes in the index and nodes where
// the side to move has a capture - are set to the value before them,
// which lengthens runs and costs nothing.
const dbMagic = "DKB1"

type manifestSlice struct {
	ID     string `json:"id"`
	WM     int    `json:"wm"`
	WK     int    `json:"wk"`
	BM     int    `json:"bm"`
	BK     int    `json:"bk"`
	Size   uint64 `json:"size"`
	Bytes  int    `json:"bytes"`
	Blocks int    `json:"blocks"`
}

type manifest struct {
	Version    int             `json:"version"`
	MaxPieces  int             `json:"maxPieces"`
	BlockShift int             `json:"blockShift"`
	MaxBudget  int             `json:"maxBudget"`
	Slices     []manifestSlice `json:"slices"`
}

// build writes the tables to dir, one file per slice. Slices are
// independent, so they are packed on as many workers as the solver used;
// deflating a few gigabytes is otherwise slower than solving them.
func build(db *DB, dir string, blockShift int) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	m := manifest{
		Version:    1,
		MaxPieces:  db.max,
		BlockShift: blockShift,
		MaxBudget:  maxBudget,
	}
	slices := make([]Slice, 0, len(db.tables))
	for s := range db.tables {
		slices = append(slices, s)
	}
	sort.Slice(slices, func(i, j int) bool {
		return fmt.Sprint(slices[i]) < fmt.Sprint(slices[j])
	})

	entries := make([]manifestSlice, len(slices))
	errs := make([]error, len(slices))
	var next atomic.Int64
	var wg sync.WaitGroup
	for w := 0; w < len(db.solvers); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			g := &Gen{}
			for {
				i := int(next.Add(1)) - 1
				if i >= len(slices) {
					return
				}
				entries[i], errs[i] = writeSlice(db, g, slices[i], dir, blockShift)
			}
		}()
	}
	wg.Wait()

	totalBytes := 0
	for i, err := range errs {
		if err != nil {
			return err
		}
		totalBytes += entries[i].Bytes
	}
	m.Slices = entries
	out, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), out, 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %d slices to %s, %.2f MB total\n",
		len(slices), dir, float64(totalBytes)/1e6)
	return nil
}

func writeSlice(
	db *DB,
	g *Gen,
	s Slice,
	dir string,
	blockShift int,
) (manifestSlice, error) {
	vals := probedValues(db, g, s)
	data, blocks := encodeSlice(s, vals, blockShift)
	name := fmt.Sprintf("%v.bin", s)
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
		return manifestSlice{}, err
	}
	return manifestSlice{
		ID: fmt.Sprint(s), WM: s.WM, WK: s.WK, BM: s.BM, BK: s.BK,
		Size: uint64(len(vals)), Bytes: len(data), Blocks: blocks,
	}, nil
}

// probedValues is the table with every never-probed position replaced by
// the value before it.
func probedValues(db *DB, g *Gen, s Slice) []byte {
	tab := db.tables[s]
	l := db.layouts[s]
	vals := make([]byte, len(tab))
	var cur byte
	for i := range tab {
		w, b, k, ok := l.position(uint64(i))
		if ok && !hasCapture(w, b, k) {
			cur = tab[i]
		}
		vals[i] = cur
	}
	return vals
}

func encodeSlice(s Slice, vals []byte, blockShift int) ([]byte, int) {
	size := len(vals)
	blockLen := 1 << uint(blockShift)
	blocks := (size + blockLen - 1) / blockLen
	var body bytes.Buffer
	offsets := make([]uint32, blocks+1)
	var buf bytes.Buffer
	zw, _ := flate.NewWriter(&buf, flate.BestCompression)
	for i := 0; i < blocks; i++ {
		end := (i + 1) * blockLen
		if end > size {
			end = size
		}
		buf.Reset()
		zw.Reset(&buf)
		_, _ = zw.Write(vals[i*blockLen : end])
		_ = zw.Close()
		body.Write(buf.Bytes())
		offsets[i+1] = uint32(body.Len())
	}
	head := new(bytes.Buffer)
	head.WriteString(dbMagic)
	_ = binary.Write(head, binary.LittleEndian, uint32(s.WM|s.WK<<8|s.BM<<16|s.BK<<24))
	_ = binary.Write(head, binary.LittleEndian, uint32(size))
	_ = binary.Write(head, binary.LittleEndian, uint32(blockShift))
	_ = binary.Write(head, binary.LittleEndian, uint32(blocks))
	for _, off := range offsets {
		_ = binary.Write(head, binary.LittleEndian, off)
	}
	head.Write(body.Bytes())
	return head.Bytes(), blocks
}
