package main

import (
	_ "embed"
	"fmt"
	"os"
	"strconv"

	. "checkers/src"
)

func main() {
	tier, err := strconv.Atoi(os.Args[1])
	if err != nil {
		panic(err)
	}

	fmt.Printf("Creating endgame database tier %v...\n", tier)
	db := CreateEndgameList(tier)

	var db1 EndgameDB
	var db2 EndgameDB

	fmt.Println("Loading endgame database...")
	db1, err = os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}

	db2, err = os.ReadFile(os.Args[3])
	if err != nil {
		panic(err)
	}

	for _, b := range db.List {
		r1, s1, ok1 := db1.LookUp(b)
		r2, s2, ok2 := db2.LookUp(b)
		difference := false
		if ok1 != ok2 {
			difference = true
			fmt.Printf("Board is in one database but not the other (%v %v).\n", ok1, ok2)
		}
		if r1 != r2 {
			difference = true
			fmt.Printf("Board has different rates (%v %v).\n", r1, r2)
		}
		if s1 != s2 {
			difference = true
			fmt.Printf("Board has different steps (%v %v).\n", s1, s2)
		}
		if difference {
			fmt.Printf("%v\n\n", b)
		}
	}
}
