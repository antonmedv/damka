/** Wanders wherever it looks: eyes mostly pupil, everything else soft. */
export function Kitten() {
  return (
    <>
      {/* Ears first, so their bases vanish under the head. */}
      <path d="M16 27 L19 7 L35 20 Z" fill="#e0cdb2" />
      <path d="M48 27 L45 7 L29 20 Z" fill="#e0cdb2" />
      <path d="M19.5 24 L21.5 13 L30 20 Z" fill="#e39a9a" />
      <path d="M44.5 24 L42.5 13 L34 20 Z" fill="#e39a9a" />
      <circle cx="32" cy="36" r="19" fill="#efdfc6" />
      {/* The one marking thick enough to survive at 40px. */}
      <path
        d="M27 20 L25.5 26 M32 19 V25.5 M37 20 L38.5 26"
        stroke="#ccb08c"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M17 40 H9 M17 45 H9 M47 40 H55 M47 45 H55"
        stroke="#ccb08c"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="24.5" cy="35" r="4.6" fill="#2b2320" />
      <circle cx="39.5" cy="35" r="4.6" fill="#2b2320" />
      <circle cx="26" cy="33.4" r="1.6" fill="#ffffff" />
      <circle cx="41" cy="33.4" r="1.6" fill="#ffffff" />
      <path d="M32 45 L28.9 42 H35.1 Z" fill="#e08c8c" />
      <path
        d="M32 45 V47 M32 47 Q28.5 50 26 47.4 M32 47 Q35.5 50 38 47.4"
        stroke="#2b2320"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </>
  )
}
