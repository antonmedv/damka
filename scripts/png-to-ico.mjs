// Packs square PNGs into a single .ico file (PNG-compressed entries).
// Usage: node scripts/png-to-ico.mjs <out.ico> <in.png>...
import { readFileSync, writeFileSync } from 'node:fs'

const [out, ...sources] = process.argv.slice(2)
if (!out || sources.length === 0) {
  throw new Error('usage: png-to-ico.mjs <out.ico> <in.png>...')
}

const images = sources.map((path) => {
  const data = readFileSync(path)
  // IHDR width/height live at byte offsets 16 and 20 of every PNG.
  return { data, width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
})

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(images.length, 4)

let offset = header.length + images.length * 16
const entries = images.map((image) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(image.width >= 256 ? 0 : image.width, 0)
  entry.writeUInt8(image.height >= 256 ? 0 : image.height, 1)
  entry.writeUInt8(0, 2) // palette colors
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(image.data.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += image.data.length
  return entry
})

writeFileSync(
  out,
  Buffer.concat([header, ...entries, ...images.map((i) => i.data)]),
)
