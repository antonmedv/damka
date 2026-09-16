/** Moves first and thinks after: the ears already point two ways. */
export function Hare() {
  return (
    <>
      <g transform="rotate(-14 27 34)">
        <ellipse cx="25" cy="18" rx="4.8" ry="14" fill="#cfc6b6" />
        <ellipse cx="25" cy="19" rx="2.2" ry="9.6" fill="#e39a9a" />
      </g>
      <g transform="rotate(22 37 34)">
        <ellipse cx="39" cy="18" rx="4.8" ry="14" fill="#cfc6b6" />
        <ellipse cx="39" cy="19" rx="2.2" ry="9.6" fill="#e39a9a" />
      </g>
      <circle cx="32" cy="38" r="17.5" fill="#ddd5c6" />
      <path
        d="M18 42 H10 M18 47 H10 M46 42 H54 M46 47 H54"
        stroke="#b8ae9c"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="25" cy="36.5" r="4.2" fill="#2b2320" />
      <circle cx="39" cy="36.5" r="4.2" fill="#2b2320" />
      <circle cx="26.4" cy="35" r="1.5" fill="#ffffff" />
      <circle cx="40.4" cy="35" r="1.5" fill="#ffffff" />
      <path d="M32 46.5 L28.8 43.6 H35.2 Z" fill="#e08c8c" />
      <path
        d="M32 46.5 V48 M32 48 Q29 50.4 26.8 48.2 M32 48 Q35 50.4 37.2 48.2"
        stroke="#2b2320"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Front teeth: the shape that says hare at any size. */}
      <path
        d="M29.9 49.4 H31.5 V53.4 H29.9 Z M32.5 49.4 H34.1 V53.4 H32.5 Z"
        fill="#f6ebdc"
      />
    </>
  )
}
