/**
 * How the UI asks for a computer move. `WorkerThinker` runs `think` in a
 * Web Worker so the board never freezes; `DirectThinker` (`direct.ts`)
 * runs it on the calling thread for tests and for browsers without
 * workers. Only this file knows about `Worker`, and nothing here imports
 * the engine: the main bundle leaves its tables to the worker.
 */
import { cappedMs } from './limits.ts'
import { personas } from './personas.ts'
import type {
  ThinkConfig,
  ThinkFailure,
  ThinkRequest,
  ThinkResponse,
} from './think.ts'

/** What a fresh worker is told to get ready. */
export const defaultConfig: ThinkConfig = {
  endgameDb: true,
  variant: 'checkers',
}

export interface Thinker {
  /** Resolves with the reply; rejects when the request is cancelled. */
  think(request: ThinkRequest): Promise<ThinkResponse>
  /**
   * Gets ready before the first request: the worker starts, which is also
   * when it begins fetching the endgame tables. Optional, and safe to
   * call more than once.
   */
  warmUp?(): void
  /** Drops every pending request and stops the search behind it. */
  cancel(): void
  /** Releases the worker; the thinker is not used afterwards. */
  dispose(): void
}

/** The part of `Worker` this file uses; tests inject a fake. */
export type WorkerLike = {
  onmessage: ((event: MessageEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown): void
  terminate(): void
}

export function createSearchWorker(): WorkerLike {
  return new Worker(new URL('./search.worker.ts', import.meta.url), {
    type: 'module',
  })
}

type Pending = {
  resolve: (reply: ThinkResponse) => void
  reject: (error: Error) => void
  /** Earliest time the reply may be delivered (`minThinkMs`). */
  readyAt: number
  /** Set while a reply is held back until `readyAt`. */
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * `think` is synchronous inside the worker, so a running search cannot
 * see a message until it returns. `cancel` therefore terminates the
 * worker and spawns a fresh one at once; the transposition table is lost,
 * which is harmless. An idle worker is kept, table and all.
 */
export class WorkerThinker implements Thinker {
  private readonly create: () => WorkerLike
  private readonly config: ThinkConfig
  private worker: WorkerLike | null = null
  private readonly pending = new Map<number, Pending>()

  constructor(
    create: () => WorkerLike = createSearchWorker,
    config: ThinkConfig = defaultConfig,
  ) {
    this.create = create
    this.config = config
  }

  warmUp(): void {
    if (this.worker === null) this.spawn()
  }

  think(request: ThinkRequest): Promise<ThinkResponse> {
    const worker = this.worker ?? this.spawn()
    const readyAt =
      performance.now() +
      cappedMs(personas[request.persona].minThinkMs, request.minThinkMs)
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, readyAt, timer: null })
      worker.postMessage(request)
    })
  }

  cancel(): void {
    if (this.pending.size === 0) return
    const searching = this.settleAll(new Error('cancelled'))
    // Only a worker still inside `think` has to go; an idle one keeps its table.
    if (searching) {
      this.worker?.terminate()
      this.spawn()
    }
  }

  dispose(): void {
    this.settleAll(new Error('disposed'))
    this.worker?.terminate()
    this.worker = null
  }

  private spawn(): WorkerLike {
    const worker = this.create()
    worker.onmessage = (event) => {
      this.receive(event.data as ThinkResponse | ThinkFailure)
    }
    worker.onerror = (event) => {
      this.fail(event.message || 'search worker failed')
    }
    worker.onmessageerror = () => {
      this.fail('search worker sent an unreadable message')
    }
    // Before anything else, so a worker that has just replaced a
    // cancelled one gets its tables back.
    worker.postMessage(this.config)
    this.worker = worker
    return worker
  }

  private receive(message: ThinkResponse | ThinkFailure): void {
    const entry = this.pending.get(message.id)
    if (entry === undefined) return
    if ('error' in message) {
      this.pending.delete(message.id)
      entry.reject(new Error(message.error))
      return
    }
    const wait = entry.readyAt - performance.now()
    if (wait <= 0) {
      this.pending.delete(message.id)
      entry.resolve(message)
      return
    }
    // Held back for `minThinkMs`; still pending, so `cancel` can drop it.
    entry.timer = setTimeout(() => {
      this.pending.delete(message.id)
      entry.resolve(message)
    }, wait)
  }

  /** Rejects every pending request; true when the worker was still searching. */
  private settleAll(error: Error): boolean {
    let searching = false
    for (const entry of this.pending.values()) {
      if (entry.timer === null) searching = true
      else clearTimeout(entry.timer)
      entry.reject(error)
    }
    this.pending.clear()
    return searching
  }

  /** The worker died or never started: fail the requests, respawn lazily. */
  private fail(message: string): void {
    this.settleAll(new Error(message))
    this.worker?.terminate()
    this.worker = null
  }
}

/**
 * A thinker loaded on first use. Keeps the engine out of the main bundle
 * unless it is really needed there.
 */
export class LazyThinker implements Thinker {
  private readonly load: () => Promise<Thinker>
  private loading: Promise<Thinker> | null = null

  constructor(load: () => Promise<Thinker>) {
    this.load = load
  }

  warmUp(): void {
    this.loading ??= this.load()
    void this.loading.then((thinker) => thinker.warmUp?.())
  }

  think(request: ThinkRequest): Promise<ThinkResponse> {
    this.loading ??= this.load()
    return this.loading.then((thinker) => thinker.think(request))
  }

  cancel(): void {
    void this.loading?.then((thinker) => thinker.cancel())
  }

  dispose(): void {
    void this.loading?.then((thinker) => thinker.dispose())
  }
}

/**
 * A worker where available, otherwise the calling thread with a short
 * budget: a full persona budget would freeze the page.
 */
export function defaultThinker(config: ThinkConfig = defaultConfig): Thinker {
  return typeof Worker === 'function'
    ? new WorkerThinker(createSearchWorker, config)
    : new LazyThinker(() =>
        import('./direct.ts').then(
          (module) => new module.DirectThinker({ budgetMs: 100 }),
        ),
      )
}
