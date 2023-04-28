package main

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"sync"

	. "checkers/src"
)

var player1 = NetZero
var player2 = Zero

func main() {
	if len(os.Args) != 4 {
		fmt.Printf("Usage: %v <versus> <population> <index>\n", os.Args[0])
		return
	}
	switch os.Args[1] {
	case "zero":
		player1 = NetZero
	case "hei":
		player1 = NetHeiOay
	default:
		panic("Unknown versus (zero, hei)")
	}
	index, err := strconv.Atoi(os.Args[3])
	if err != nil {
		panic(err)
	}
	player2 = LoadPopulation(os.Args[2])[index].Net

	b := NewBoard()
	boards := []Board{
		b,
		Board{U: 9223394075501583213, V: 160842835429380},
		Board{U: 9223374834635299693, V: 160842306961412},
		Board{U: 9223547964850887533, V: 160842842767620},
		Board{U: 9223394075501583213, V: 160842835314692},
	}
	for _, x := range b.AllMoves() {
		for _, y := range x.AllMoves() {
			boards = append(boards, y)
		}
	}

	inputCh := make(chan Board)
	workCh := make(chan Board)
	outputCh := make(chan [2]Status)
	done := make(chan bool)

	var wg sync.WaitGroup
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go scheduler(ctx, inputCh, workCh)
	for i := 0; i < runtime.NumCPU(); i++ {
		go worker(ctx, workCh, outputCh)
	}

	for _, b := range boards {
		wg.Add(1)
		inputCh <- b
	}

	go func() {
		wg.Wait()
		done <- true
	}()

	wins1 := 0
	wins2 := 0
	draws := 0
	i := 0
	for {
		select {
		case <-done:
			return
		case s := <-outputCh:
			for _, status := range s {
				if status == WhiteWins {
					wins1++
				} else if status == BlackWins {
					wins2++
				} else {
					draws++
				}
			}
			i++
			ProgressBar(i, len(boards), 50, fmt.Sprintf("(%v, %v, %v)", wins1, wins2, draws))
			wg.Done()
		}
	}
}

func worker(ctx context.Context, work chan Board, output chan [2]Status) {
	p1 := NewMinimax(player1, 4, nil)
	p2 := NewMinimax(player2, 4, nil)
	for {
		select {
		case <-ctx.Done():
			return
		case b := <-work:
			s1 := Play(b, p1, p2, false)
			s2 := Play(b, p2, p1, false)
			// fmt.Printf("\n%v\np1 plays white: %v\np2 plays white: %v\n\n", b, s1, s2)
			output <- [2]Status{s1, -s2}
		}
	}
}

func scheduler(ctx context.Context, input chan Board, work chan Board) {
	var queue []Board
	for {
		if len(queue) == 0 {
			select {
			case <-ctx.Done():
				return
			case i := <-input:
				queue = append(queue, i)
			}
		} else {
			select {
			case <-ctx.Done():
				return
			case i := <-input:
				queue = append(queue, i)
			case work <- queue[0]:
				queue = queue[1:]
			}
		}
	}
}