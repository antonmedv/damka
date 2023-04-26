package src

import "fmt"

// Pos represents a position on the board.
// Type uint64 used to avoid type conversion with Board.
type Pos = uint64 // From 0 to 31.

const End = Pos(241187) // Represents an invalid position.

// Dir represents directions.
type Dir uint8

const (
	UpLeft Dir = iota
	UpRight
	DownLeft
	DownRight
)

func PosString(i Pos) string {
	switch i {
	case 0:
		return "b8"
	case 1:
		return "d8"
	case 2:
		return "f8"
	case 3:
		return "h8"
	case 4:
		return "a7"
	case 5:
		return "c7"
	case 6:
		return "e7"
	case 7:
		return "g7"
	case 8:
		return "b6"
	case 9:
		return "d6"
	case 10:
		return "f6"
	case 11:
		return "h6"
	case 12:
		return "a5"
	case 13:
		return "c5"
	case 14:
		return "e5"
	case 15:
		return "g5"
	case 16:
		return "b4"
	case 17:
		return "d4"
	case 18:
		return "f4"
	case 19:
		return "h4"
	case 20:
		return "a3"
	case 21:
		return "c3"
	case 22:
		return "e3"
	case 23:
		return "g3"
	case 24:
		return "b2"
	case 25:
		return "d2"
	case 26:
		return "f2"
	case 27:
		return "h2"
	case 28:
		return "a1"
	case 29:
		return "c1"
	case 30:
		return "e1"
	case 31:
		return "g1"
	default:
		panic("invalid position")
	}
}

func Parse(s string) Pos {
	switch s {
	case "b8":
		return 0
	case "d8":
		return 1
	case "f8":
		return 2
	case "h8":
		return 3
	case "a7":
		return 4
	case "c7":
		return 5
	case "e7":
		return 6
	case "g7":
		return 7
	case "b6":
		return 8
	case "d6":
		return 9
	case "f6":
		return 10
	case "h6":
		return 11
	case "a5":
		return 12
	case "c5":
		return 13
	case "e5":
		return 14
	case "g5":
		return 15
	case "b4":
		return 16
	case "d4":
		return 17
	case "f4":
		return 18
	case "h4":
		return 19
	case "a3":
		return 20
	case "c3":
		return 21
	case "e3":
		return 22
	case "g3":
		return 23
	case "b2":
		return 24
	case "d2":
		return 25
	case "f2":
		return 26
	case "h2":
		return 27
	case "a1":
		return 28
	case "c1":
		return 29
	case "e1":
		return 30
	case "g1":
		return 31
	default:
		panic(fmt.Sprintf("invalid position: %s", s))
	}
}

func GotoDir(i Pos, dir Dir) Pos {
	switch dir {
	case UpLeft:
		switch i {
		case 0:
			return End
		case 1:
			return End
		case 2:
			return End
		case 3:
			return End
		case 4:
			return End
		case 5:
			return 0
		case 6:
			return 1
		case 7:
			return 2
		case 8:
			return 4
		case 9:
			return 5
		case 10:
			return 6
		case 11:
			return 7
		case 12:
			return End
		case 13:
			return 8
		case 14:
			return 9
		case 15:
			return 10
		case 16:
			return 12
		case 17:
			return 13
		case 18:
			return 14
		case 19:
			return 15
		case 20:
			return End
		case 21:
			return 16
		case 22:
			return 17
		case 23:
			return 18
		case 24:
			return 20
		case 25:
			return 21
		case 26:
			return 22
		case 27:
			return 23
		case 28:
			return End
		case 29:
			return 24
		case 30:
			return 25
		case 31:
			return 26
		default:
			panic("invalid position")
		}
	case UpRight:
		switch i {
		case 0:
			return End
		case 1:
			return End
		case 2:
			return End
		case 3:
			return End
		case 4:
			return 0
		case 5:
			return 1
		case 6:
			return 2
		case 7:
			return 3
		case 8:
			return 5
		case 9:
			return 6
		case 10:
			return 7
		case 11:
			return End
		case 12:
			return 8
		case 13:
			return 9
		case 14:
			return 10
		case 15:
			return 11
		case 16:
			return 13
		case 17:
			return 14
		case 18:
			return 15
		case 19:
			return End
		case 20:
			return 16
		case 21:
			return 17
		case 22:
			return 18
		case 23:
			return 19
		case 24:
			return 21
		case 25:
			return 22
		case 26:
			return 23
		case 27:
			return End
		case 28:
			return 24
		case 29:
			return 25
		case 30:
			return 26
		case 31:
			return 27
		default:
			panic("invalid position")
		}
	case DownLeft:
		switch i {
		case 0:
			return 4
		case 1:
			return 5
		case 2:
			return 6
		case 3:
			return 7
		case 4:
			return End
		case 5:
			return 8
		case 6:
			return 9
		case 7:
			return 10
		case 8:
			return 12
		case 9:
			return 13
		case 10:
			return 14
		case 11:
			return 15
		case 12:
			return End
		case 13:
			return 16
		case 14:
			return 17
		case 15:
			return 18
		case 16:
			return 20
		case 17:
			return 21
		case 18:
			return 22
		case 19:
			return 23
		case 20:
			return End
		case 21:
			return 24
		case 22:
			return 25
		case 23:
			return 26
		case 24:
			return 28
		case 25:
			return 29
		case 26:
			return 30
		case 27:
			return 31
		case 28:
			return End
		case 29:
			return End
		case 30:
			return End
		case 31:
			return End
		default:
			panic("invalid position")
		}
	case DownRight:
		switch i {
		case 0:
			return 5
		case 1:
			return 6
		case 2:
			return 7
		case 3:
			return End
		case 4:
			return 8
		case 5:
			return 9
		case 6:
			return 10
		case 7:
			return 11
		case 8:
			return 13
		case 9:
			return 14
		case 10:
			return 15
		case 11:
			return End
		case 12:
			return 16
		case 13:
			return 17
		case 14:
			return 18
		case 15:
			return 19
		case 16:
			return 21
		case 17:
			return 22
		case 18:
			return 23
		case 19:
			return End
		case 20:
			return 24
		case 21:
			return 25
		case 22:
			return 26
		case 23:
			return 27
		case 24:
			return 29
		case 25:
			return 30
		case 26:
			return 31
		case 27:
			return End
		case 28:
			return End
		case 29:
			return End
		case 30:
			return End
		case 31:
			return End
		default:
			panic("invalid position")
		}
	default:
		panic("invalid direction")
	}
}
