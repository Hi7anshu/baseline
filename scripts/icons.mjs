// Generate the PWA icons without pulling in an image library.
//
// The mark is the app's own heat scale: three bars running cool to hot, which is exactly what
// the body map shades with. Written as raw PNG because adding a canvas dependency to draw four
// rectangles would cost more than the encoder does.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [13, 17, 23]
const BARS = [[77, 58, 28], [196, 127, 27], [240, 136, 62]]

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  // Rounded-square plate, then three bars centred in it — proportional so both sizes match.
  const r = size * 0.22
  const barH = size * 0.11
  const gap = size * 0.07
  const left = size * 0.24
  const widths = [0.34, 0.44, 0.52].map(w => w * size)
  const top = (size - (barH * 3 + gap * 2)) / 2

  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      let rgb = insideRounded(x, y, size, r) ? BG : [0, 0, 0]
      for (let i = 0; i < 3; i++) {
        const by = top + i * (barH + gap)
        if (y >= by && y < by + barH && x >= left && x < left + widths[i]) rgb = BARS[i]
      }
      row[1 + x * 3] = rgb[0]
      row[2 + x * 3] = rgb[1]
      row[3 + x * 3] = rgb[2]
    }
    rows.push(row)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 2      // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function insideRounded(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r)
  const cy = Math.min(Math.max(y, r), size - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

mkdirSync(OUT, { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(join(OUT, name), png(size))
  console.log('wrote', name, size)
}
