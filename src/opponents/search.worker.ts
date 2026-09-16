/* v8 ignore file */
/**
 * Worker glue: one request in, one response out. Everything else lives in
 * `think.ts`, which is pure and tested without a worker.
 */
import { think } from './think.ts'
import type { ThinkFailure, ThinkRequest, ThinkResponse } from './think.ts'

type WorkerScope = {
  onmessage: ((event: MessageEvent<ThinkRequest>) => void) | null
  postMessage(message: ThinkResponse | ThinkFailure): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const request = event.data
  try {
    scope.postMessage(think(request))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    scope.postMessage({ id: request.id, error: message })
  }
}
