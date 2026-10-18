// Generates favicon and PWA/Apple icons from src/brand/mark.svg.
// Run with `npm run icons` after editing the mark.
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const GRAPHITE = '#0F1B20'
const OFF_WHITE = '#F8FAFC'
const mark = readFileSync('src/brand/mark.svg', 'utf8')
const inner = mark.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
const viewBox = mark.match(/viewBox="([^"]+)"/)[1]

// Mark centred on a square ground; `scale` leaves room for maskable safe zones.
const tile = ({ fg, bg, scale = 0.82, radius = 0 }) => {
  const size = 128 * scale
  const off = (128 - size) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" color="${fg}">
  <rect width="128" height="128" rx="${radius}" fill="${bg}"/>
  <svg x="${off}" y="${off}" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg>
</svg>`
}

const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/${file}`)

mkdirSync('public/icons', { recursive: true })

// Favicon follows the browser's colour scheme.
writeFileSync('public/favicon.svg', mark
  .replace('<svg ', '<svg color="#0F1B20" ')
  .replace('<defs>', `<style>@media (prefers-color-scheme: dark){svg{color:${OFF_WHITE}}}</style><defs>`))

const dark = tile({ fg: OFF_WHITE, bg: GRAPHITE })
const maskable = tile({ fg: OFF_WHITE, bg: GRAPHITE, scale: 0.62 })

await Promise.all([
  png(tile({ fg: OFF_WHITE, bg: GRAPHITE, scale: 0.9, radius: 22 }), 32, 'favicon-32.png'),
  png(dark, 192, 'icons/icon-192.png'),
  png(dark, 512, 'icons/icon-512.png'),
  png(maskable, 192, 'icons/maskable-192.png'),
  png(maskable, 512, 'icons/maskable-512.png'),
  png(tile({ fg: OFF_WHITE, bg: GRAPHITE, scale: 0.72 }), 180, 'apple-touch-icon.png'),
  png(tile({ fg: GRAPHITE, bg: OFF_WHITE, scale: 0.72 }), 512, 'icons/icon-light-512.png'),
])
console.log('icons written to public/')
