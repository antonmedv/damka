/**
 * Loads the endgame tables `dbgen` writes into `public/db`.
 *
 * The search is synchronous, so nothing can be fetched while it runs: the
 * loader is started once, and every search that begins after a slice has
 * arrived uses it. A failed load is not an error the player should ever
 * see - the engine simply falls back to its evaluation - so the caller
 * decides what to do with a rejection.
 *
 * The small slices come down at the start; the rest are fetched once the
 * search has looked for them, which is the only way to know which of them
 * a game will actually touch.
 */
import { dbAddSlice, dbExpect, dbMisses, sliceOf } from './db.ts'

export type ManifestSlice = {
  readonly id: string
  readonly wm: number
  readonly wk: number
  readonly bm: number
  readonly bk: number
  readonly size: number
  readonly bytes: number
  readonly blocks: number
}

export type Manifest = {
  readonly version: number
  readonly maxPieces: number
  readonly blockShift: number
  readonly maxBudget: number
  readonly slices: ReadonlyArray<ManifestSlice>
}

export const MANIFEST_VERSION = 1

/** Pieces in a slice; the tables are fetched by material, smallest first. */
export function slicePieces(s: ManifestSlice): number {
  return s.wm + s.wk + s.bm + s.bk
}

/** Slice files in flight at once. */
const FETCH_CONCURRENCY = 4
/**
 * How far below the pieces on the board a missed slice may be before it
 * is worth fetching. A deep search probes material the game itself is
 * nowhere near - every way the position could be traded down - so
 * fetching everything it looked for would fetch nearly the whole set.
 */
const MISS_MARGIN = 2
/**
 * Slices fetched per move. The search misses far more than it leans on,
 * and `dbMisses` puts the ones it asked for most first, so a few per move
 * arrive in the order the game will want them.
 */
export const MISS_BATCH = 2

/**
 * Fetches tables as a game needs them. `start` brings in the manifest and
 * every slice of at most `eagerPieces` pieces; `fetchMissed` asks for the
 * slices the last search looked for and did not find.
 *
 * Material only shrinks and men only promote, so from a position with men
 * on the board nearly every slice is still reachable - fetching by what
 * is reachable would fetch the lot. Fetching by what was actually probed
 * costs one search of going without, and a game touches few slices.
 */
export type EndgameLoader = {
  /** Idempotent; rejects only if the manifest itself cannot be read. */
  start(): Promise<void>
  /**
   * Queues the slices the search missed, given the pieces on the board it
   * was asked about. Never throws.
   */
  fetchMissed(pieces: number): void
}

export function createEndgameLoader(
  baseUrl: string,
  eagerPieces: number,
  fetchImpl: typeof fetch = fetch,
): EndgameLoader {
  let manifest: Manifest | null = null
  let started: Promise<void> | null = null
  const held = new Set<string>()
  const queue: ManifestSlice[] = []
  let active = 0

  const fetchSlice = async (slice: ManifestSlice): Promise<void> => {
    const file = await fetchImpl(`${baseUrl}db/${slice.id}.bin`)
    if (!file.ok) throw new Error(`no endgame slice ${slice.id}`)
    const bytes = new Uint8Array(await file.arrayBuffer())
    // A short body would inflate into zeros, which read as draws rather
    // than as an error, so the length is checked before it is believed.
    if (bytes.length !== slice.bytes) {
      throw new Error(`endgame slice ${slice.id} is ${bytes.length} bytes`)
    }
    dbAddSlice(bytes)
  }

  const pump = (): void => {
    while (active < FETCH_CONCURRENCY && queue.length > 0) {
      const slice = queue.shift()!
      active++
      void fetchSlice(slice)
        .catch(() => {
          // A slice that will not load is one the search does without.
          held.delete(slice.id)
        })
        .finally(() => {
          active--
          pump()
        })
    }
  }

  const queueMissed = (pieces: number): void => {
    if (manifest === null) return
    let taken = 0
    for (const key of dbMisses()) {
      if (taken >= MISS_BATCH) break
      const { wm, wk, bm, bk } = sliceOf(key)
      const id = `${wm}m${wk}kv${bm}m${bk}k`
      if (held.has(id)) continue
      const slice = manifest.slices.find((s) => s.id === id)
      if (slice === undefined) continue
      if (slicePieces(slice) + MISS_MARGIN < pieces) continue
      held.add(id)
      queue.push(slice)
      taken++
    }
    pump()
  }

  return {
    start(): Promise<void> {
      started ??= (async () => {
        const response = await fetchImpl(`${baseUrl}db/manifest.json`)
        if (!response.ok) {
          throw new Error(`no endgame manifest: ${response.status}`)
        }
        const read = (await response.json()) as Manifest
        if (read.version !== MANIFEST_VERSION) {
          throw new Error(`endgame manifest version ${read.version}`)
        }
        manifest = read
        // Probe positions the manifest covers even before their table is
        // in, so the search records them as misses to be fetched.
        dbExpect(read.maxPieces)
        // One slice that will not load must not take the rest with it:
        // the search does without whatever is missing, and the tables
        // that did arrive are still worth having.
        await Promise.all(
          read.slices
            .filter((slice) => slicePieces(slice) <= eagerPieces)
            .map(async (slice) => {
              held.add(slice.id)
              await fetchSlice(slice).catch(() => held.delete(slice.id))
            }),
        )
        // A search that ran while the manifest was still on its way found
        // nothing to probe beyond what it had; one that ran just after it
        // may already have missed something.
        queueMissed(0)
      })()
      return started
    },
    fetchMissed(pieces: number): void {
      if (started === null) return
      void started.then(
        () => queueMissed(pieces),
        () => {},
      )
    },
  }
}
