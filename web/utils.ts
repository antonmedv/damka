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

export async function sleep(duration: number) {
  return new Promise(resolve => setTimeout(resolve, duration))
}
