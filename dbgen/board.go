// Package main holds the endgame database generator for Damka.
//
// The board representation mirrors src/engine/bitboard.ts exactly: the 32
// dark squares of the 8x8 board in one uint32, square index
// sq = rank*4 + file>>1, white at the bottom.
//
//	rank 8:    28  29  30  31        b8 d8 f8 h8
//	rank 7:  24  25  26  27          a7 c7 e7 g7
//	rank 6:    20  21  22  23        b6 d6 f6 h6
//	rank 5:  16  17  18  19          a5 c5 e5 g5
//	rank 4:    12  13  14  15        b4 d4 f4 h4
//	rank 3:   8   9  10  11          a3 c3 e3 g3
//	rank 2:     4   5   6   7        b2 d2 f2 h2
//	rank 1:   0   1   2   3          a1 c1 e1 g1
//
// Keeping the two representations identical is what lets the generated
// tables be probed by the TypeScript engine without a translation layer.
package main

import "math/bits"

const (
	evenRanks uint32 = 0x0f0f0f0f // ranks 1, 3, 5, 7 - files a c e g
	oddRanks  uint32 = 0xf0f0f0f0 // ranks 2, 4, 6, 8 - files b d f h
	evenNotA  uint32 = 0x0e0e0e0e
	oddNotH   uint32 = 0x70707070

	rank1 uint32 = 0x0000000f
	rank8 uint32 = 0xf0000000
)

// Directions from white's point of view; up = towards rank 8.
const (
	upLeftDir = iota
	upRightDir
	downLeftDir
	downRightDir
)

// Sides, as in the engine.
const (
	white = 0
	black = 1
)

func upLeft(b uint32) uint32    { return ((b & evenNotA) << 3) | ((b & oddRanks) << 4) }
func upRight(b uint32) uint32   { return ((b & evenRanks) << 4) | ((b & oddNotH) << 5) }
func downLeft(b uint32) uint32  { return ((b & evenNotA) >> 5) | ((b & oddRanks) >> 4) }
func downRight(b uint32) uint32 { return ((b & evenRanks) >> 4) | ((b & oddNotH) >> 3) }

func step(b uint32, dir int) uint32 {
	switch dir {
	case upLeftDir:
		return upLeft(b)
	case upRightDir:
		return upRight(b)
	case downLeftDir:
		return downLeft(b)
	default:
		return downRight(b)
	}
}

// rays[dir<<5|sq] holds every square strictly beyond sq in that direction.
var rays = buildRays()

func buildRays() [128]uint32 {
	var r [128]uint32
	for dir := 0; dir < 4; dir++ {
		for sq := 0; sq < 32; sq++ {
			var mask uint32
			for b := step(1<<uint(sq), dir); b != 0; b = step(b, dir) {
				mask |= b
			}
			r[dir<<5|sq] = mask
		}
	}
	return r
}

// nearest is the blocker closest to the square the ray started from:
// walking up the board means increasing indices, so it is the lowest bit;
// walking down it is the highest. blockers must be non-zero.
func nearest(blockers uint32, dir int) uint32 {
	if dir < 2 {
		return blockers & -blockers
	}
	return 1 << uint(31-bits.LeadingZeros32(blockers))
}

// mirrorBits turns the board 180 degrees: square sq becomes 31-sq.
func mirrorBits(b uint32) uint32 { return bits.Reverse32(b) }
