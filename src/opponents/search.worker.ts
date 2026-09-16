/* v8 ignore file */
/**
 * Worker glue: one request in, one response out. Everything else lives in
 * `think.ts`, which is pure and tested without a worker.
 *
 * The first message is the configuration, which is what starts the
 * endgame tables loading, while the worker is otherwise idle. `think` is
 * synchronous and cannot wait for them: a search started before a slice
 * arrives simply runs without it.
 */
import { popcount } from '../engine/bitboard.ts'
import { createEndgameLoader } from '../engine/endgameDb.ts'
import { parsePos } from '../engine/position.ts'
import { think } from './think.ts'
import type {
  ThinkConfig,
  ThinkFailure,
  ThinkRequest,
  ThinkResponse,
} from './think.ts'

type WorkerScope = {
  onmessage: ((event: MessageEvent<ThinkRequest | ThinkConfig>) => void) | null
  postMessage(message: ThinkResponse | ThinkFailure): void
}

const scope = self as unknown as WorkerScope

/** Pieces small enough to fetch up front; the rest follow the game. */
const EAGER_PIECES = 4

const loader = createEndgameLoader(import.meta.env.BASE_URL, EAGER_PIECES)

scope.onmessage = (event) => {
  if ('endgameDb' in event.data) {
    if (event.data.endgameDb) {
      void loader.start().catch(() => {
        // No tables: the search falls back to its evaluation, which is
        // the behaviour every build had before they existed.
      })
    }
    return
  }
  const request = event.data
  try {
    scope.postMessage(think(request))
    // Only now: a fetch started before the search would have waited for
    // it anyway, and the reply would have waited for the fetch.
    const p = parsePos(request.position)
    loader.fetchMissed(popcount(p.white | p.black))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    scope.postMessage({ id: request.id, error: message })
  }
}
