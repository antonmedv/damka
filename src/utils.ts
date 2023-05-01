export function $(selector: string) {
  return document.querySelector(selector)! as HTMLElement | null
}

export function domReady(fn: () => void) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    fn()
  } else {
    document.addEventListener('DOMContentLoaded', fn)
  }
}

export function random<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

export function choose<T>(not: number, gen: T[], n: number): T[] {
  let result: T[] = []
  let taken = new Set<number>()
  if (n >= gen.length) {
    return []
  }
  while (true) {
    let r = Math.floor(Math.random() * gen.length)
    if (not == r) continue
    if (taken.has(r)) continue
    result.push(gen[r])
    taken.add(r)
    if (result.length >= n) break
  }
  return result
}

export function makeid(length: number) {
  let result = ''
  let characters = 'abcdefghijklmnopqrstuvwxyz'
  let charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

export function N(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random() //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}
