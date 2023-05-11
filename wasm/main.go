//go:build js && wasm

package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"syscall/js"

	. "checkers/src"
)

var buildTime = "unset"

//go:embed data.json
var data []byte

var m *Minimax
var population []*Breed

func main() {
	err := json.Unmarshal(data, &population)
	if err != nil {
		panic(err)
	}
	js.Global().Set("popName", js.FuncOf(popName))
	js.Global().Set("minimax", js.FuncOf(minimax))
	js.Global().Set("allMoves", js.FuncOf(allMoves))
	js.Global().Set("buildTime", js.ValueOf(buildTime))
	<-make(chan bool)
}

func popName(this js.Value, args []js.Value) any {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println(r)
		}
	}()
	breed := population[args[0].Int()]
	return []any{breed.Name}
}

func minimax(this js.Value, args []js.Value) any {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println(r)
		}
	}()
	breed := population[args[2].Int()]
	maxDepth := args[1].Int()
	m = NewMinimax(breed.Net, maxDepth, nil)
	b := parseBoard(args[0])
	alpha := math.Inf(-1)
	beta := math.Inf(1)
	m.ClearStats()
	rate, steps := m.Minimax(b, m.MaxDepth, alpha, beta)
	// fmt.Printf("(cache_size:%v cache_hits:%v db_hits:%v)\n", len(m.Cache), m.CacheHits, m.DBHits)
	if len(m.Cache) > 1_000_000 {
		fmt.Println("cache cleared after", len(m.Cache), "entries")
		m.Cache = make(map[Params]Score)
	}
	return []any{rate, steps}
}

func allMoves(this js.Value, args []js.Value) any {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println(r)
		}
	}()
	b := parseBoard(args[0])
	moves := make([]any, 0)
	for _, move := range b.AllMoves() {
		moves = append(moves, b.GenerateMoveName(move))
	}
	return moves
}

func parseBoard(value js.Value) Board {
	b := Board{}
	for i := 0; i < 32; i++ {
		switch value.Get("cells").Index(i).String() {
		case "o":
			b = b.Set(Pos(i), WhiteMan)
		case "O":
			b = b.Set(Pos(i), WhiteKing)
		case "x":
			b = b.Set(Pos(i), BlackMan)
		case "X":
			b = b.Set(Pos(i), BlackKing)
		}
	}
	if value.Get("turn").String() == "black" {
		b = b.Turn(false)
	}
	b.SetOnlyKingMoves(value.Get("onlyKingMoves").Int())
	return b
}
