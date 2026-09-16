import { useCallback, useRef } from 'react'
import { t } from '../i18n/index.ts'
import { GameScreen } from './GameScreen.tsx'
import type { GameScreenProps } from './GameScreen.tsx'
import { NavBar } from './NavBar.tsx'

type PageProps = Omit<GameScreenProps, 'onFlipReady'>

/**
 * Page chrome above and below, the game between them. The navbar carries
 * the board's own flip button, which the screen below hands up once it has
 * mounted. It goes into a ref rather than state: the button is there from
 * the first paint whatever the screen has got round to, so nothing shifts
 * into place and no render is spent on the handover.
 */
export function Page(props: PageProps) {
  const flip = useRef<(() => void) | null>(null)
  const provideFlip = useCallback((handler: () => void) => {
    flip.current = handler
  }, [])
  const onFlip = useCallback(() => flip.current?.(), [])

  return (
    <>
      <NavBar onFlip={onFlip} />
      <main className="app">
        <GameScreen {...props} onFlipReady={provideFlip} />
      </main>
      <footer className="credit">{t.credit}</footer>
    </>
  )
}
