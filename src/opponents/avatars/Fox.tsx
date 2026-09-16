/** Tricks and sets traps: narrowed eyes over a sharp white muzzle. */
export function Fox() {
  return (
    <>
      <path d="M13 30 L17 7 L34 20 Z" fill="#d9662a" />
      <path d="M51 30 L47 7 L30 20 Z" fill="#d9662a" />
      <path d="M16.4 13 L17 7 L22.5 11 Z" fill="#b4491b" />
      <path d="M47.6 13 L47 7 L41.5 11 Z" fill="#b4491b" />
      <circle cx="32" cy="36" r="18.5" fill="#ef8034" />
      {/* Ruff and muzzle in one shape, so the face reads pointed. */}
      <path
        d="M32 55.5 Q18.5 51 17.8 41 Q24.5 38.4 32 39.6 Q39.5 38.4 46.2 41 Q45.5 51 32 55.5 Z"
        fill="#f6ebdc"
      />
      <path
        d="M20.8 35.6 Q25.2 32.4 29.8 34.8 Q25.4 37.4 20.8 35.6 Z"
        fill="#2b2320"
      />
      <path
        d="M43.2 35.6 Q38.8 32.4 34.2 34.8 Q38.6 37.4 43.2 35.6 Z"
        fill="#2b2320"
      />
      <circle cx="24.2" cy="34.8" r="1.1" fill="#ffffff" />
      <circle cx="39.8" cy="34.8" r="1.1" fill="#ffffff" />
      <path d="M32 47 L28.6 43.6 Q32 42.4 35.4 43.6 Z" fill="#2b2320" />
      <path
        d="M32 47 V48.6 M32 48.6 Q28.8 51.4 26.6 48.8 M32 48.6 Q35.2 51.4 37.4 48.8"
        stroke="#2b2320"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </>
  )
}
