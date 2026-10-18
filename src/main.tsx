import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './styles/base.css'
import { AppStateProvider } from './app/AppStateProvider'
import { router } from './router'
import { ThemeProvider } from './theme/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AppStateProvider>
        <RouterProvider router={router} />
      </AppStateProvider>
    </ThemeProvider>
  </StrictMode>,
)
