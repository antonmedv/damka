package src

import (
	"fmt"
	"math/rand"
	"strings"

	"golang.org/x/term"
)

func GenerateRandomName() string {
	minLength := 3
	maxLength := 5
	vowels := "aeiouy"
	consonants := "bcdfghjklmnpqrstvwxz"
	nameLength := rand.Intn(maxLength-minLength+1) + minLength
	name := make([]byte, nameLength)

	for i := 0; i < nameLength; i++ {
		if i%2 == 0 {
			name[i] = consonants[rand.Intn(len(consonants))]
		} else {
			name[i] = vowels[rand.Intn(len(vowels))]
		}
	}

	return string(name)
}

// weightedRandomPick returns a random index from the given slice of rates,
// with the probability of selecting each index being proportional to its rate.
func weightedRandomPick(rates []float64) int {
	// Compute the sum of all rates.
	total := 0.0
	for _, rate := range rates {
		total += rate
	}

	// Generate a random value between 0 and the total sum.
	r := rand.Float64() * total

	// Find the index corresponding to the random value.
	runningTotal := 0.0
	for i, rate := range rates {
		runningTotal += rate
		if r <= runningTotal {
			return i
		}
	}

	return len(rates) - 1
}

func ProgressBar(current, total, width int, status string) {
	progress := float64(current) / float64(total)
	filled := int(progress * float64(width))
	empty := width - filled

	fmt.Printf("\r[")
	for i := 0; i < filled; i++ {
		fmt.Print("=")
	}
	for i := 0; i < empty; i++ {
		fmt.Print(" ")
	}
	fmt.Printf("] %3.0f%% %s", progress*100, status)
}

func ClearProgressBar() {
	fmt.Printf("\r%s\r", strings.Repeat(" ", termWidth()-3))
}

func termWidth() int {
	if !term.IsTerminal(0) {
		return 80
	}
	width, _, err := term.GetSize(0)
	if err != nil {
		return 80
	}
	return width
}
