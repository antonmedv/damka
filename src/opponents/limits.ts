/**
 * Limits shared by the request and the persona. Kept in its own file
 * because `thinker.ts` needs it in the main bundle and must not import
 * `think.ts`, which would drag the engine along with it.
 */

/** The shorter of two limits; a missing one means no cap of its own. */
export function cappedMs(ours: number, theirs: number | undefined): number {
  return theirs === undefined ? ours : Math.min(ours, theirs)
}
