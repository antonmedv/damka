import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DB_UNKNOWN, dbClear, dbPieces, dbProbe } from './db.ts'
import { MISS_BATCH, createEndgameLoader } from './endgameDb.ts'
import { parsePos } from './position.ts'
import { DRAW_SCORE } from './score.ts'

/** Serves `public/db` from disk, the way the worker sees it over HTTP. */
const serve: typeof fetch = (input) => {
  const path = String(input).replace(/^\//, '')
  try {
    const body = readFileSync(path)
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(body.toString('utf8'))),
      arrayBuffer: () =>
        Promise.resolve(
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        ),
    } as Response)
  } catch {
    return Promise.resolve({ ok: false, status: 404 } as Response)
  }
}

afterEach(() => {
  dbClear()
})

describe('createEndgameLoader', () => {
  it('loads the small slices first and the rest when a probe asks', async () => {
    const loader = createEndgameLoader('public/', 2, serve)
    await loader.start()
    // Everything the manifest covers is probed, loaded or not, so that a
    // position beyond what is loaded is recorded rather than passed over.
    expect(dbPieces()).toBe(5)

    const p = parsePos('W:WKa1:Bb6,d6:0')
    expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(DB_UNKNOWN)
    loader.fetchMissed(5)
    await vi.waitFor(() => {
      expect(
        dbProbe(p.white, p.black, p.kings, p.side, p.plies),
      ).toBeGreaterThan(DRAW_SCORE)
    })
  })

  it('starts only once, and does nothing before it is started', async () => {
    const calls: string[] = []
    const counted: typeof fetch = (input) => {
      calls.push(String(input))
      return serve(input)
    }
    const loader = createEndgameLoader('public/', 2, counted)
    loader.fetchMissed(5)
    expect(calls).toHaveLength(0)
    await Promise.all([loader.start(), loader.start()])
    expect(calls.filter((c) => c.endsWith('manifest.json'))).toHaveLength(1)
  })

  it('asks for nothing the search has not looked for', async () => {
    const calls: string[] = []
    const counted: typeof fetch = (input) => {
      calls.push(String(input))
      return serve(input)
    }
    const loader = createEndgameLoader('public/', 2, counted)
    await loader.start()
    const eager = calls.length
    loader.fetchMissed(5)
    await Promise.resolve()
    expect(calls).toHaveLength(eager)
  })

  it('fetches a few slices per move rather than every miss at once', async () => {
    const files: string[] = []
    const counted: typeof fetch = (input) => {
      const name = String(input)
      if (name.endsWith('.bin')) files.push(name)
      return serve(input)
    }
    const loader = createEndgameLoader('public/', 2, counted)
    await loader.start()
    const eager = files.length
    // Four slices the search looked for and none of them loaded.
    for (const literal of [
      'W:WKa1:Bb6,d6:0',
      'W:WKa1,Kc1:Bb6,d6:0',
      'W:Wa1,c1:Bb6,d6:0',
      'W:WKa1,Kc1,Ke1:Bb6,d6:0',
    ]) {
      const p = parsePos(literal)
      expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(
        DB_UNKNOWN,
      )
    }
    loader.fetchMissed(5)
    await vi.waitFor(() => expect(files.length).toBeGreaterThan(eager))
    expect(files.length - eager).toBe(MISS_BATCH)
  })

  it('reports a missing manifest', async () => {
    await expect(
      createEndgameLoader('nowhere/', 2, serve).start(),
    ).rejects.toThrow('no endgame manifest')
  })
})

describe('createEndgameLoader, when a file is bad', () => {
  /** Serves `public/db`, but breaks the slices named here. */
  function breaking(broken: Record<string, 'missing' | 'short'>): typeof fetch {
    return async (input) => {
      const name = String(input).split('/db/')[1] ?? ''
      const how = broken[name]
      if (how === 'missing') return { ok: false, status: 404 } as Response
      const response = await serve(input)
      if (how !== 'short') return response
      const body = await response.arrayBuffer()
      return {
        ...response,
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(body.slice(0, body.byteLength - 8)),
      } as Response
    }
  }

  it('loads the rest and still prefetches', async () => {
    const loader = createEndgameLoader(
      'public/',
      2,
      breaking({ '0m1kv0m1k.bin': 'missing' }),
    )
    await loader.start()
    // The one slice of two kings against one king is the one that broke.
    const kings = parsePos('W:WKa1:BKh8:0')
    expect(
      dbProbe(kings.white, kings.black, kings.kings, kings.side, kings.plies),
    ).toBe(DB_UNKNOWN)
    const p = parsePos('W:WKa1:Bb6,d6:0')
    expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(DB_UNKNOWN)
    loader.fetchMissed(5)
    await vi.waitFor(() => {
      expect(
        dbProbe(p.white, p.black, p.kings, p.side, p.plies),
      ).toBeGreaterThan(DRAW_SCORE)
    })
  })

  it('refuses a truncated slice rather than reading zeros', async () => {
    const loader = createEndgameLoader(
      'public/',
      2,
      breaking({ '0m1kv0m1k.bin': 'short' }),
    )
    await loader.start()
    const p = parsePos('W:WKa1:BKh8:0')
    expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(DB_UNKNOWN)
  })
})
