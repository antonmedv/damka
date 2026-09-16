import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Keeps a native `<dialog>` in step with the state that says whether it is
 * open. jsdom has no `showModal`, so the open attribute stands in for it
 * there; everything else about the element — the backdrop, the focus trap,
 * Escape — is the browser's own.
 */
export function useDialog(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
): void {
  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [ref, open])
}
