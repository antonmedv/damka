/** Two people at one device: a gap between head and shoulders keeps
    both figures readable where the avatar is only 40px across. */
export function Friend() {
  return (
    <>
      <circle cx="43" cy="25" r="8" fill="#1c1815" />
      <path d="M29 64 Q29 37 43 37 Q57 37 57 64 Z" fill="#1c1815" />
      <circle cx="22" cy="27" r="8" fill="#f4ead6" />
      <path d="M8 64 Q8 39 22 39 Q36 39 36 64 Z" fill="#f4ead6" />
    </>
  )
}
