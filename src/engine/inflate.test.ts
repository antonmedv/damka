import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { inflateRaw } from './inflate.ts'

function roundTrip(data: Uint8Array, level = 9): Uint8Array {
  const packed = new Uint8Array(deflateRawSync(data, { level }))
  const out = new Uint8Array(data.length)
  const n = inflateRaw(packed, out)
  expect(n).toBe(data.length)
  return out
}

/** Table-like data: long runs of one value with occasional changes. */
function runs(length: number, seed: number): Uint8Array {
  const data = new Uint8Array(length)
  let state = seed
  let value = 0
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    if (state % 37 === 0) value = state % 62
    data[i] = value
  }
  return data
}

describe('inflateRaw', () => {
  it('reads an empty stream', () => {
    expect(roundTrip(new Uint8Array(0))).toEqual(new Uint8Array(0))
  })

  it('reads a stored block', () => {
    const data = new Uint8Array(1000)
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 0xff
    expect(roundTrip(data, 0)).toEqual(data)
  })

  it('reads fixed and dynamic blocks', () => {
    for (const level of [1, 6, 9]) {
      const data = runs(40000, 12345)
      expect(roundTrip(data, level)).toEqual(data)
    }
  })

  it('reads incompressible data', () => {
    const data = new Uint8Array(20000)
    let state = 7
    for (let i = 0; i < data.length; i++) {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      data[i] = state & 0xff
    }
    expect(roundTrip(data)).toEqual(data)
  })

  it('reads every block the generator writes', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const data = runs(8192, seed)
      expect(roundTrip(data)).toEqual(data)
    }
  })
})
