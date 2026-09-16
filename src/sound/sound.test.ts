import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Fresh module state per test: the preference is read once, at import. */
async function loadModule() {
  vi.resetModules()
  return await import('./sound.ts')
}

/** Enough of Web Audio to see whether a sound was started. */
function fakeAudio() {
  const started: number[] = []
  const buffer = {} as AudioBuffer
  const context = {
    state: 'suspended' as AudioContextState,
    destination: {},
    resume: vi.fn(),
    decodeAudioData: vi.fn(() => Promise.resolve(buffer)),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: () => started.push(1),
    }),
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn() }),
  }
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context
      }
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    ),
  )
  return { started, context }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sound preference', () => {
  it('is on until it is turned off', async () => {
    const sound = await loadModule()
    expect(sound.isSoundOn()).toBe(true)
  })

  it('remembers being turned off across a reload', async () => {
    const sound = await loadModule()
    sound.setSoundOn(false)
    expect(sound.isSoundOn()).toBe(false)

    const reloaded = await loadModule()
    expect(reloaded.isSoundOn()).toBe(false)
  })

  it('remembers being turned back on', async () => {
    const sound = await loadModule()
    sound.setSoundOn(false)
    sound.setSoundOn(true)

    const reloaded = await loadModule()
    expect(reloaded.isSoundOn()).toBe(true)
  })
})

describe('playMove', () => {
  it('does nothing where Web Audio is missing', async () => {
    const sound = await loadModule()
    expect(() => sound.playMove()).not.toThrow()
  })

  it('decodes once and plays, resuming the suspended context', async () => {
    const { started, context } = fakeAudio()
    const sound = await loadModule()

    sound.playMove()
    await vi.waitFor(() => expect(started).toHaveLength(1))
    expect(context.resume).toHaveBeenCalled()

    sound.playMove()
    await vi.waitFor(() => expect(started).toHaveLength(2))
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('stays silent while the sound is off', async () => {
    const { started } = fakeAudio()
    const sound = await loadModule()
    sound.setSoundOn(false)

    sound.playMove()
    await Promise.resolve()
    expect(started).toHaveLength(0)
  })
})
