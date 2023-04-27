package src

import "math/rand"

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
