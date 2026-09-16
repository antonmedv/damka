import { afterEach, beforeEach } from 'vitest'

type Call = { target: Element; keyframes: Keyframe[]; cancelled: boolean }

/**
 * jsdom implements no Web Animations API, so piece slides are invisible to
 * the tests. Installs a recorder on `Element.prototype.animate` for the
 * surrounding describe block and hands back the calls it collects.
 */
export function captureAnimations() {
  let calls: Call[] = []

  beforeEach(() => {
    calls = []
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: function (this: Element, keyframes: Keyframe[]) {
        const call: Call = { target: this, keyframes, cancelled: false }
        calls.push(call)
        return {
          cancel: () => {
            call.cancelled = true
          },
        } as Animation
      },
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate')
  })

  return {
    all: (): ReadonlyArray<Call> => calls,
    /** Animations started on `element` and not cancelled since. */
    live: (element: Element | null): ReadonlyArray<Call> =>
      calls.filter((call) => call.target === element && !call.cancelled),
    /** Transforms of the keyframes animated on `element`, in order. */
    of: (element: Element | null): string[] =>
      calls
        .filter((call) => call.target === element)
        .flatMap((call) =>
          call.keyframes.map((frame) => String(frame.transform)),
        ),
  }
}
