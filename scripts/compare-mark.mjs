// Overlays src/brand/mark.svg (red outline) on a reference raster for tracing checks.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const [ref, out] = process.argv.slice(2)
const { width, height } = await sharp(ref).metadata()
const inner = readFileSync('src/brand/mark.svg', 'utf8').replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const outline = inner.replace(/fill="[^"]*"/g, '').replace(/<path /g, '<path fill="none" stroke="red" stroke-width="1.5" ')
  .replace('<g fill="currentColor">', '<g>')
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${outline}</svg>`
const layer = await sharp(Buffer.from(overlay)).resize(width, height).png().toBuffer()
// sharp resizes before compositing, so flatten first.
const merged = await sharp(ref).composite([{ input: layer }]).png().toBuffer()
await sharp(merged).resize(width * 2).toFile(out)
