/**
 * `Thinker` for the calling thread: tests and browsers without `Worker`.
 * Kept apart from `thinker.ts` so that importing the latter does not pull
 * the engine (its transposition table and lookup tables) into the main
 * bundle; `defaultThinker` loads this file on demand.
 */
import { personas } from './personas.ts'
import type { Persona } from './personas.ts'
import { thinkWith } from './think.ts'
import type { ThinkRequest, ThinkResponse } from './think.ts'
import type { Thinker } from './thinker.ts'

/**
 * Synchronous `think` behind a resolved promise. Ignores `minThinkMs`;
 * `override` replaces persona limits, so tests can search shallow.
 */
export class DirectThinker implements Thinker {
  private readonly override: Partial<Persona>

  constructor(override: Partial<Persona> = {}) {
    this.override = override
  }

  think(request: ThinkRequest): Promise<ThinkResponse> {
    try {
      const persona = { ...personas[request.persona], ...this.override }
      return Promise.resolve(thinkWith(request, persona))
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  }

  cancel(): void {}

  dispose(): void {}
}
