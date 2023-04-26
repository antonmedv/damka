package src

func (b Board) AllMoves() []Board {
	moves, _ := b.AllMovesWithFlag()
	return moves
}

func (b Board) AllMovesWithFlag() ([]Board, bool) {
	man := WhiteMan
	king := WhiteKing
	if b.IsBlackTurn() {
		man = BlackMan
		king = BlackKing
	}

	// Allocates an approx number of moves what can be made in any game,
	// with any number of pieces.
	moves := make([]Board, 0, 35)
	eatMoves := make([]Board, 0, 8)
	for i := Pos(0); i < 32; i++ {
		if b.Get(i) == man {
			b.manMoves(&moves, i)
			b.manEats(&eatMoves, i, 0)
		} else if b.Get(i) == king {
			b.kingMoves(&moves, i)
			b.kingEats(&eatMoves, i, 0)
		}
	}
	if len(eatMoves) > 0 {
		return eatMoves, true
	} else {
		return moves, false
	}
}

func (b Board) manMoves(moves *[]Board, from Pos) {
	piece := b.Get(from)
	if piece == WhiteMan {
		b.manMovesDir(moves, from, UpLeft)
		b.manMovesDir(moves, from, UpRight)
	} else if piece == BlackMan {
		b.manMovesDir(moves, from, DownLeft)
		b.manMovesDir(moves, from, DownRight)
	} else {
		panic("invalid cell")
	}
}

func (b Board) manMovesDir(moves *[]Board, from Pos, dir Dir) {
	piece := b.Get(from)
	to := GotoDir(from, dir)
	if to != End && b.IsEmpty(to) {
		as := piece
		if piece == WhiteMan && to < 4 {
			as = WhiteKing
		} else if piece == BlackMan && to > 27 {
			as = BlackKing
		}
		move := b.Turn(false).Set(from, Empty).Set(to, as)
		*moves = append(*moves, move)
	}
}

func (b Board) kingMoves(moves *[]Board, from Pos) {
	piece := b.Get(from)
	if !IsKing(piece) {
		panic("invalid piece")
	}
	b.kingMovesDir(moves, from, UpLeft)
	b.kingMovesDir(moves, from, UpRight)
	b.kingMovesDir(moves, from, DownLeft)
	b.kingMovesDir(moves, from, DownRight)
}

func (b Board) kingMovesDir(moves *[]Board, from Pos, dir Dir) {
	piece := b.Get(from)
	to := GotoDir(from, dir)
	for to != End && b.IsEmpty(to) {
		move := b.Turn(true).Set(from, Empty).Set(to, piece)
		*moves = append(*moves, move)
		to = GotoDir(to, dir)
	}
}

func (b Board) manEats(moves *[]Board, from Pos, eaten uint32) bool {
	moreMoves := false
	moreMoves = b.manEatsDir(moves, from, UpLeft, eaten) || moreMoves
	moreMoves = b.manEatsDir(moves, from, UpRight, eaten) || moreMoves
	moreMoves = b.manEatsDir(moves, from, DownLeft, eaten) || moreMoves
	moreMoves = b.manEatsDir(moves, from, DownRight, eaten) || moreMoves
	return moreMoves
}

func (b Board) manEatsDir(moves *[]Board, from Pos, dir Dir, eaten uint32) bool {
	piece := b.Get(from)
	if !IsMan(piece) {
		panic("invalid piece")
	}
	enemy := GotoDir(from, dir)
	if enemy != End && b.IsEnemy(enemy) {
		to := GotoDir(enemy, dir)
		if to != End && b.IsEmpty(to) {
			as := piece
			if piece == WhiteMan && to < 4 {
				as = WhiteKing
			} else if piece == BlackMan && to > 27 {
				as = BlackKing
			}
			move := b.Set(from, Empty).Set(enemy, Empty).Set(to, as)
			eaten |= 1 << enemy // Mark enemy as eaten.
			var hasMoreMoves bool
			if IsKing(as) {
				hasMoreMoves = move.kingEats(moves, to, eaten)
			} else {
				hasMoreMoves = move.manEats(moves, to, eaten)
			}
			if !hasMoreMoves {
				*moves = append(*moves, move.Turn(false))
			}
			return true
		}
	}
	return false
}

func (b Board) kingEats(moves *[]Board, from Pos, eaten uint32) bool {
	moreMoves := false
	moreMoves = b.kingEatsDir(moves, from, UpLeft, eaten) || moreMoves
	moreMoves = b.kingEatsDir(moves, from, UpRight, eaten) || moreMoves
	moreMoves = b.kingEatsDir(moves, from, DownLeft, eaten) || moreMoves
	moreMoves = b.kingEatsDir(moves, from, DownRight, eaten) || moreMoves
	return moreMoves
}

func (b Board) kingEatsDir(moves *[]Board, from Pos, dir Dir, eaten uint32) bool {
	piece := b.Get(from)
	if !IsKing(piece) {
		panic("invalid piece")
	}
	enemy := GotoDir(from, dir)
	// Scroll till the end of the board or till the empty cell.
	// If the cell is already eaten, then we can't eat it again.
	for enemy != End && b.IsEmpty(enemy) && eaten&(1<<enemy) == 0 {
		enemy = GotoDir(enemy, dir)
	}
	if enemy != End && b.IsEnemy(enemy) {
		// Find more jumps required for the king.
		foundMoreEats := false
		{
			// Make sure what variable to is not used outside of this block.
			to := GotoDir(enemy, dir)
			for to != End && b.IsEmpty(to) {
				move := b.Set(from, Empty).Set(enemy, Empty).Set(to, piece)
				eaten |= 1 << enemy // Mark enemy as eaten.
				hasMoreMoves := move.kingEats(moves, to, eaten)
				if hasMoreMoves {
					foundMoreEats = true
				}
				to = GotoDir(to, dir)
			}
		}
		if !foundMoreEats {
			// This is a final destination for the king.
			// Again start from a position after the eaten enemy.
			foundMoves := false
			to := GotoDir(enemy, dir)
			for to != End && b.IsEmpty(to) {
				foundMoves = true
				move := b.Set(from, Empty).Set(enemy, Empty).Set(to, piece)
				eaten |= 1 << enemy // Mark enemy as eaten.
				*moves = append(*moves, move.Turn(false))
				to = GotoDir(to, dir)
			}
			return foundMoves
		}
	}
	return false
}
