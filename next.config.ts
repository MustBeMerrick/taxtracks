import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Never trace the SQLite data directory (it is opened at runtime via
  // process.cwd()) into the standalone bundle or Docker image.
  outputFileTracingExcludes: { '*': ['./data/**'] },
  turbopack: {
    root: __dirname,
  },
  // Lets phones on the LAN load the dev server via its IP (Next.js otherwise blocks
  // cross-origin requests to dev-only assets/HMR, so the page loads but nothing hydrates).
  allowedDevOrigins: ['10.0.0.23'],
}

export default nextConfig
