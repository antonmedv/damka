cd(__dirname + '/..')

$.env.GOOS = 'js'
$.env.GOARCH = 'wasm'

let flags = `-X main.buildTime=${new Date().toISOString()}`

await $`go build -ldflags ${flags} -o build/main.wasm wasm/main.go`

await $`cp "$(go env GOROOT)/misc/wasm/wasm_exec.js" build/wasm_exec.js`
