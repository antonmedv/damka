import { afterEach, describe, expect, it, vi } from 'vitest'
import { moveKey } from '../engine/move.ts'
import { formatPos, initialBitPosition } from '../engine/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { legalMoves } from '../game/moves.ts'
import { personas } from './personas.ts'
import type { ThinkRequest, ThinkResponse } from './think.ts'
import { DirectThinker } from './direct.ts'
import { LazyThinker, WorkerThinker, defaultThinker } from './thinker.ts'
import type { WorkerLike } from './thinker.ts'

const start = formatPos(initialBitPosition())
const request: ThinkRequest = {
  id: 1,
  position: start,
  persona: 'hare',
  seed: 1,
}

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly sent: ThinkRequest[] = []
  terminated = false

  postMessage(message: unknown): void {
    this.sent.push(message as ThinkRequest)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent)
  }

  crash(message: string): void {
    this.onerror?.({ message } as ErrorEvent)
  }
}

function replyFor(req: ThinkRequest): ThinkResponse {
  const move = legalMoves(fromBitPosition(initialBitPosition()))[0]!
  return { id: req.id, move, score: 0, depth: 1, nodes: 1, ms: 0 }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('DirectThinker', () => {
  it('answers on the calling thread with a legal move', async () => {
    const reply = await new DirectThinker({ depth: 2 }).think(request)
    expect(reply.id).toBe(1)
    expect(reply.depth).toBe(2)
    const keys = legalMoves(fromBitPosition(initialBitPosition())).map(moveKey)
    expect(keys).toContain(moveKey(reply.move))
  })

  it('rejects when there is nothing to play', async () => {
    const thinker = new DirectThinker({ depth: 2 })
    await expect(
      thinker.think({ ...request, position: 'W:W:Bd4' }),
    ).rejects.toThrow(/no legal moves/)
  })
})

describe('LazyThinker', () => {
  it('loads the thinker once, on the first request', async () => {
    let loads = 0
    const thinker = new LazyThinker(() => {
      loads++
      return Promise.resolve(new DirectThinker({ depth: 2 }))
    })
    expect(loads).toBe(0)
    const [a, b] = await Promise.all([
      thinker.think(request),
      thinker.think({ ...request, id: 2 }),
    ])
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(loads).toBe(1)
  })

  it('is the default without Worker and answers with a legal move', async () => {
    vi.stubGlobal('Worker', undefined)
    try {
      const thinker = defaultThinker()
      expect(thinker).toBeInstanceOf(LazyThinker)
      const reply = await thinker.think(request)
      const keys = legalMoves(fromBitPosition(initialBitPosition())).map(
        moveKey,
      )
      expect(keys).toContain(moveKey(reply.move))
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('WorkerThinker', () => {
  function setup() {
    const workers: FakeWorker[] = []
    const thinker = new WorkerThinker(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })
    return { workers, thinker }
  }

  it('posts the request and resolves with the reply', async () => {
    vi.useFakeTimers()
    const { workers, thinker } = setup()
    const promise = thinker.think(request)
    expect(workers).toHaveLength(1)
    expect(workers[0]!.sent).toEqual([request])
    workers[0]!.reply(replyFor(request))
    await vi.advanceTimersByTimeAsync(personas.hare.minThinkMs)
    await expect(promise).resolves.toMatchObject({ id: 1 })
  })

  it('holds a fast reply back until the minimum think time', async () => {
    vi.useFakeTimers()
    const { workers, thinker } = setup()
    const settled = vi.fn()
    void thinker.think(request).then(settled)
    workers[0]!.reply(replyFor(request))
    await vi.advanceTimersByTimeAsync(personas.hare.minThinkMs - 50)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('shortens the minimum think time when the request asks it to', async () => {
    vi.useFakeTimers()
    const { workers, thinker } = setup()
    const settled = vi.fn()
    void thinker.think({ ...request, minThinkMs: 20 }).then(settled)
    workers[0]!.reply(replyFor(request))
    await vi.advanceTimersByTimeAsync(20)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('never waits longer than the persona because the request said so', async () => {
    vi.useFakeTimers()
    const { workers, thinker } = setup()
    const settled = vi.fn()
    void thinker.think({ ...request, minThinkMs: 10_000 }).then(settled)
    workers[0]!.reply(replyFor(request))
    await vi.advanceTimersByTimeAsync(personas.hare.minThinkMs)
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('cancels by replacing the worker and rejecting the pending request', async () => {
    const { workers, thinker } = setup()
    const promise = thinker.think(request)
    thinker.cancel()
    await expect(promise).rejects.toThrow('cancelled')
    expect(workers[0]!.terminated).toBe(true)
    expect(workers).toHaveLength(2)
    // A late reply from the old worker is ignored.
    workers[0]!.reply(replyFor(request))
    // The new worker takes the next request.
    void thinker.think({ ...request, id: 2 })
    expect(workers[1]!.sent.map((r) => r.id)).toEqual([2])
  })

  it('drops a reply held for the minimum think time and keeps the idle worker', async () => {
    vi.useFakeTimers()
    const { workers, thinker } = setup()
    const promise = thinker.think(request)
    workers[0]!.reply(replyFor(request))
    thinker.cancel()
    await expect(promise).rejects.toThrow('cancelled')
    expect(workers).toHaveLength(1)
    expect(workers[0]!.terminated).toBe(false)
    await vi.advanceTimersByTimeAsync(personas.hare.minThinkMs)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does nothing on cancel when nothing is pending', () => {
    const { workers, thinker } = setup()
    thinker.cancel()
    expect(workers).toHaveLength(0)
  })

  it('fails pending requests when the worker crashes and respawns lazily', async () => {
    const { workers, thinker } = setup()
    const promise = thinker.think(request)
    workers[0]!.crash('boom')
    await expect(promise).rejects.toThrow('boom')
    expect(workers[0]!.terminated).toBe(true)
    expect(workers).toHaveLength(1)
    void thinker.think({ ...request, id: 2 })
    expect(workers).toHaveLength(2)
    expect(workers[1]!.sent.map((r) => r.id)).toEqual([2])
  })

  it('rejects when the worker reports a failure', async () => {
    const { workers, thinker } = setup()
    const promise = thinker.think(request)
    workers[0]!.reply({ id: 1, error: 'no legal moves in W:W:Bd4' })
    await expect(promise).rejects.toThrow(/no legal moves/)
  })

  it('ignores replies it did not ask for and releases on dispose', async () => {
    const { workers, thinker } = setup()
    const promise = thinker.think(request)
    workers[0]!.reply({ ...replyFor(request), id: 99 })
    thinker.dispose()
    await expect(promise).rejects.toThrow('disposed')
    expect(workers[0]!.terminated).toBe(true)
  })
})
