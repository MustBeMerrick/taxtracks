import type { Metadata, Viewport } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'
import { ThemeProvider } from '@/components/app/ThemeProvider'
import { THEME_STORAGE_KEY } from '@/components/app/theme'
import { RefreshProvider } from '@/lib/refresh-context'
import '@/styles/base.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' })

export const metadata: Metadata = {
  title: { default: 'Tax Tracks', template: '%s · Tax Tracks' },
  description: 'Your taxes. On track. Personal tax forecasting and withholding tracking.',
  applicationName: 'Tax Tracks',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Tax Tracks', statusBarStyle: 'black-translucent' },
  // Private app: keep it out of search engines even though it's reachable publicly.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#141a1f' },
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
  ],
}

// Applies the saved theme before first paint to avoid a flash.
const themeScript = `(function(){var p='system';try{p=localStorage.getItem('${THEME_STORAGE_KEY}')||'system'}catch(e){}var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'})()`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set by themeScript before hydration.
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <RefreshProvider>{children}</RefreshProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
