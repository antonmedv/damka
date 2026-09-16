/**
 * Raw DEFLATE decoder (RFC 1951), synchronous.
 *
 * The endgame tables are stored as independently deflated blocks, and the
 * search probes them from inside `negamax`, which cannot await anything:
 * `DecompressionStream` is asynchronous, so the decoder lives here. One
 * block is a few kilobytes, decoded in well under a millisecond and then
 * kept in a cache, so the bit-at-a-time canonical decoding of `decode` is
 * fast enough and stays small.
 *
 * Everything the decoder needs is module-level and reused: one call
 * allocates nothing.
 */

const MAX_BITS = 15
const MAX_LIT = 288
const MAX_DIST = 30

/** Base length and extra bits of the length codes 257..285. */
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
]
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
]
/** Base distance and extra bits of the distance codes 0..29. */
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
]
/** The order the code-length code lengths appear in a dynamic block. */
const CLCL_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]

/* A canonical Huffman table: how many codes of each length, and the
 * symbols in canonical order. */
const litCounts = new Int32Array(MAX_BITS + 1)
const litSymbols = new Int32Array(MAX_LIT)
const distCounts = new Int32Array(MAX_BITS + 1)
const distSymbols = new Int32Array(MAX_DIST + 2)
const clCounts = new Int32Array(MAX_BITS + 1)
const clSymbols = new Int32Array(19)
const lengths = new Int32Array(MAX_LIT + MAX_DIST + 2)
const offsets = new Int32Array(MAX_BITS + 2)

let input: Uint8Array = new Uint8Array(0)
let output: Uint8Array = new Uint8Array(0)
let inPos = 0
let outPos = 0
let bitBuf = 0
let bitCount = 0

/**
 * Decompresses `src` into `out` and returns the number of bytes written.
 * `out` must be large enough; `src` must be one complete raw deflate
 * stream, as written by Go's `compress/flate`.
 */
export function inflateRaw(src: Uint8Array, out: Uint8Array): number {
  input = src
  output = out
  inPos = 0
  outPos = 0
  bitBuf = 0
  bitCount = 0
  for (;;) {
    const last = bits(1)
    const type = bits(2)
    if (type === 0) stored()
    else if (type === 1) block(true)
    else if (type === 2) block(false)
    else throw new Error('invalid deflate block type')
    if (last !== 0) break
  }
  return outPos
}

/** The next `need` bits, least significant first. */
function bits(need: number): number {
  let value = bitBuf
  while (bitCount < need) {
    value |= input[inPos++]! << bitCount
    bitCount += 8
  }
  bitBuf = value >>> need
  bitCount -= need
  return value & ((1 << need) - 1)
}

function stored(): void {
  bitBuf = 0
  bitCount = 0
  const len = input[inPos]! | (input[inPos + 1]! << 8)
  const nlen = input[inPos + 2]! | (input[inPos + 3]! << 8)
  if ((len ^ 0xffff) !== nlen) throw new Error('invalid stored block length')
  inPos += 4
  output.set(input.subarray(inPos, inPos + len), outPos)
  inPos += len
  outPos += len
}

/** One compressed block; `fixed` picks the fixed code tables. */
function block(fixed: boolean): void {
  if (fixed) fixedTables()
  else dynamicTables()
  for (;;) {
    const symbol = decode(litCounts, litSymbols)
    if (symbol < 256) {
      output[outPos++] = symbol
      continue
    }
    if (symbol === 256) return
    const index = symbol - 257
    if (index >= LENGTH_BASE.length) throw new Error('invalid length code')
    const length = LENGTH_BASE[index]! + bits(LENGTH_EXTRA[index]!)
    const distSymbol = decode(distCounts, distSymbols)
    const distance = DIST_BASE[distSymbol]! + bits(DIST_EXTRA[distSymbol]!)
    let from = outPos - distance
    if (from < 0) throw new Error('distance before the start of the output')
    for (let i = 0; i < length; i++) output[outPos++] = output[from++]!
  }
}

/**
 * The symbol of the next code: walk one bit at a time, comparing against
 * the first code of each length, as in `puff`.
 */
function decode(counts: Int32Array, symbols: Int32Array): number {
  let code = 0
  let first = 0
  let index = 0
  for (let len = 1; len <= MAX_BITS; len++) {
    code |= bits(1)
    const count = counts[len]!
    if (code - count < first) return symbols[index + (code - first)]!
    index += count
    first = (first + count) << 1
    code <<= 1
  }
  throw new Error('invalid deflate code')
}

/** Fills a canonical table from `lengths[from .. from + n)`. */
function construct(
  counts: Int32Array,
  symbols: Int32Array,
  from: number,
  n: number,
): void {
  counts.fill(0)
  for (let i = 0; i < n; i++) counts[lengths[from + i]!]!++
  offsets[1] = 0
  for (let len = 1; len < MAX_BITS; len++) {
    offsets[len + 1] = offsets[len]! + counts[len]!
  }
  for (let i = 0; i < n; i++) {
    const len = lengths[from + i]!
    if (len !== 0) symbols[offsets[len]!++] = i
  }
}

function fixedTables(): void {
  for (let i = 0; i < 144; i++) lengths[i] = 8
  for (let i = 144; i < 256; i++) lengths[i] = 9
  for (let i = 256; i < 280; i++) lengths[i] = 7
  for (let i = 280; i < 288; i++) lengths[i] = 8
  construct(litCounts, litSymbols, 0, 288)
  for (let i = 0; i < 30; i++) lengths[i] = 5
  construct(distCounts, distSymbols, 0, 30)
}

function dynamicTables(): void {
  const nlen = bits(5) + 257
  const ndist = bits(5) + 1
  const ncode = bits(4) + 4
  if (nlen > MAX_LIT || ndist > MAX_DIST + 2) {
    throw new Error('too many deflate codes')
  }
  lengths.fill(0, 0, 19)
  for (let i = 0; i < ncode; i++) lengths[CLCL_ORDER[i]!] = bits(3)
  construct(clCounts, clSymbols, 0, 19)

  let index = 0
  while (index < nlen + ndist) {
    const symbol = decode(clCounts, clSymbols)
    if (symbol < 16) {
      lengths[index++] = symbol
      continue
    }
    let value = 0
    let repeat: number
    if (symbol === 16) {
      if (index === 0) throw new Error('no previous code length to repeat')
      value = lengths[index - 1]!
      repeat = 3 + bits(2)
    } else if (symbol === 17) {
      repeat = 3 + bits(3)
    } else {
      repeat = 11 + bits(7)
    }
    if (index + repeat > nlen + ndist) throw new Error('too many code lengths')
    while (repeat-- > 0) lengths[index++] = value
  }
  construct(litCounts, litSymbols, 0, nlen)
  construct(distCounts, distSymbols, nlen, ndist)
}
