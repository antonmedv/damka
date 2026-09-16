import { loadPrefs } from './state/preferences.ts'
import { defaultStart, startFromQuery } from './state/startup.ts'
import type { Start } from './state/startup.ts'
import { Page } from './ui/Page.tsx'

/**
 * Read once: the query string is for trying a position, not for routing,
 * and the stored preferences are the game the player set up last.
 */
const start: Start =
  typeof window === 'undefined'
    ? defaultStart
    : startFromQuery(window.location.search, loadPrefs())

export function App() {
  return (
    <Page
      initialSetup={start.setup}
      initialPosition={start.position}
      initialColor={start.colorChoice}
    />
  )
}

export default App
