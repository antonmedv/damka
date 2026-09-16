// Session replay via rrweb cloud (https://rrweb.com/docs/cloud/browser-client).
//
// The client is loaded lazily and only in production builds, so it never
// competes with the game for first paint and dev runs stay out of the
// recordings (same policy as Yandex Metrika in vite.config.ts). The key is a
// public key, safe to ship to the browser.
const PUBLIC_API_KEY = 'public_key_rr_W4QSZSV8JCR3BS69VAK9SQ6FWW00ZM9H'

export function startSessionReplay(): void {
  if (!import.meta.env.PROD) return
  import('@rrweb/browser-client')
    .then(({ start }) => {
      start({
        publicApiKey: PUBLIC_API_KEY,
        meta: {
          environment: 'production',
          app_version: __APP_VERSION__,
        },
      })
    })
    .catch(() => {
      // Replay is best-effort; a blocked or failed load must never break the game.
    })
}
