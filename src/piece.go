package src

type Piece = uint64

const (
	Empty     Piece = 0b000
	WhiteMan  Piece = 0b100
	BlackMan  Piece = 0b101
	WhiteKing Piece = 0b110
	BlackKing Piece = 0b111
)

const (
	O = WhiteKing
	X = BlackKing
)

func IsWhite(piece Piece) bool {
	return piece == WhiteMan || piece == WhiteKing
}

func IsBlack(piece Piece) bool {
	return piece == BlackMan || piece == BlackKing
}

func IsMan(piece Piece) bool {
	return piece == WhiteMan || piece == BlackMan
}

func IsKing(piece Piece) bool {
	return piece == WhiteKing || piece == BlackKing
}
