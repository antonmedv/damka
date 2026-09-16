package main

import (
	"fmt"
	"strings"
)

var files = "abcdefgh"

func squareName(sq int) string {
	rank := sq >> 2
	file := ((sq & 3) << 1) | ((sq >> 2) & 1)
	return fmt.Sprintf("%c%d", files[file], rank+1)
}

func squareFromName(name string) (int, error) {
	if len(name) != 2 {
		return 0, fmt.Errorf("bad square %q", name)
	}
	file := strings.IndexByte(files, name[0])
	rank := int(name[1] - '1')
	if file < 0 || rank < 0 || rank > 7 || (file+rank)%2 != 0 {
		return 0, fmt.Errorf("bad square %q", name)
	}
	return rank*4 + file>>1, nil
}

// parsePos reads the engine's literal, e.g. "W:Wa1,Kc3:Bf6,Kh8".
func parsePos(s string) (w, b, k uint32, side int, err error) {
	parts := strings.Split(s, ":")
	if len(parts) < 3 {
		return 0, 0, 0, 0, fmt.Errorf("bad position %q", s)
	}
	if parts[0] == "B" {
		side = black
	}
	for _, part := range parts[1:3] {
		if part == "" {
			continue
		}
		colour := part[0]
		for _, name := range strings.Split(part[1:], ",") {
			if name == "" {
				continue
			}
			king := name[0] == 'K'
			if king {
				name = name[1:]
			}
			sq, err := squareFromName(name)
			if err != nil {
				return 0, 0, 0, 0, err
			}
			bit := uint32(1) << uint(sq)
			if colour == 'W' {
				w |= bit
			} else {
				b |= bit
			}
			if king {
				k |= bit
			}
		}
	}
	return w, b, k, side, nil
}

func formatPos(w, b, k uint32, side int) string {
	var sb strings.Builder
	if side == white {
		sb.WriteString("W:W")
	} else {
		sb.WriteString("B:W")
	}
	sb.WriteString(pieceList(w, k))
	sb.WriteString(":B")
	sb.WriteString(pieceList(b, k))
	return sb.String()
}

func pieceList(side, kings uint32) string {
	var names []string
	for sq := 0; sq < 32; sq++ {
		bit := uint32(1) << uint(sq)
		if side&bit == 0 {
			continue
		}
		if kings&bit != 0 {
			names = append(names, "K"+squareName(sq))
		} else {
			names = append(names, squareName(sq))
		}
	}
	return strings.Join(names, ",")
}
