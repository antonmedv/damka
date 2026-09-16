// ?no-inline: real files, not base64 in the bundle — the mp3 is small enough
// that Vite would otherwise inline the copy most browsers never fetch.
import moveMp3 from './move.mp3?no-inline'
import moveOgg from './move.ogg?no-inline'

/**
 * The move click, played through Web Audio: one decoded buffer replayed per
 * move, so two moves in quick succession overlap instead of cutting each
 * other short the way a single <audio> element would. Where Web Audio is
 * missing (tests, old browsers) every call here is a no-op — sound is
 * decoration, and nothing in the game may depend on it.
 */

/** The sample peaks near full scale; the click belongs under the music of the room. */
const GAIN = 0.1

const STORAGE_KEY = 'damka.sound'

let on = storedPreference()
let context: AudioContext | null = null
let bytes: Promise<ArrayBuffer | null> | null = null
let decoded: Promise<AudioBuffer | null> | null = null
let buffer: AudioBuffer | null = null

function storedPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    // Storage blocked (private mode, third-party frame): on for this session.
    return true
  }
}

export function isSoundOn(): boolean {
  return on
}

export function setSoundOn(value: boolean): void {
  on = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off')
  } catch {
    // Not remembered; the game still plays.
  }
}

/** Ogg is the smaller file; Safari only decodes the mp3. */
function soundUrl(): string {
  const audio = document.createElement('audio')
  return audio.canPlayType('audio/ogg; codecs=vorbis') === ''
    ? moveMp3
    : moveOgg
}

function encoded(): Promise<ArrayBuffer | null> {
  bytes ??= fetch(soundUrl())
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null)
  return bytes
}

/**
 * Fetches the file ahead of the first move. No AudioContext yet: browsers
 * start one suspended until the first gesture, and creating it early only
 * earns a console warning.
 */
export function preloadMoveSound(): void {
  if (!on) return
  void encoded()
}

function audioContext(): AudioContext | null {
  if (context !== null) return context
  if (typeof AudioContext === 'undefined') return null
  context = new AudioContext()
  return context
}

function decode(ctx: AudioContext): Promise<AudioBuffer | null> {
  decoded ??= encoded().then((data) =>
    data === null ? null : ctx.decodeAudioData(data).catch(() => null),
  )
  return decoded
}

function start(ctx: AudioContext, sound: AudioBuffer): void {
  const source = ctx.createBufferSource()
  source.buffer = sound
  const gain = ctx.createGain()
  gain.gain.value = GAIN
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start()
}

/** Plays the click for a move that just landed. */
export function playMove(): void {
  if (!on) return
  const ctx = audioContext()
  if (ctx === null) return
  // Autoplay rules keep the context suspended until the first gesture.
  if (ctx.state === 'suspended') void ctx.resume()
  if (buffer !== null) {
    start(ctx, buffer)
    return
  }
  void decode(ctx).then((ready) => {
    if (ready === null) return
    buffer = ready
    // Decoding takes a few milliseconds; only the very first move waits.
    if (on) start(ctx, ready)
  })
}
