'use client'

import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { Logo } from '@/components/brand/Logo'
import '@/components/ui/controls.css'
import './login.css'

export default function LoginPage() {
  const router = useRouter()
  const [hasPasskey, setHasPasskey] = useState(false)
  const [webAuthnSupported] = useState(() => typeof window !== 'undefined' && browserSupportsWebAuthn())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/auth/passkey/status')
      .then((r) => r.json())
      .then((d: { hasPasskey: boolean }) => setHasPasskey(d.hasPasskey))
      .catch(() => setHasPasskey(false))
  }, [])

  function enter() {
    router.push('/')
    router.refresh()
  }

  async function loginWithPasskey() {
    setError(null)
    setBusy(true)
    try {
      const optionsResponse = await fetch('/api/auth/passkey/login/options', { method: 'POST' })
      if (!optionsResponse.ok) throw new Error()
      const assertion = await startAuthentication({ optionsJSON: await optionsResponse.json() })
      const verifyResponse = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assertion),
      })
      if (!verifyResponse.ok) throw new Error()
      enter()
    } catch {
      setError('Passkey sign-in failed or was cancelled.')
    } finally {
      setBusy(false)
    }
  }

  async function loginWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Read from the form, not React state: iOS AutoFill from a password manager
    // can set the DOM value without firing a React-visible input event.
    const password = new FormData(event.currentTarget).get('password')
    if (typeof password !== 'string' || !password) return
    setError(null)
    setBusy(true)
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Incorrect password')
        return
      }
      enter()
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="tt-login">
      <div className="tt-login-card">
        <Logo layout="stacked" size={64} tagline="Your taxes. On track." />

        {error && (
          <p className="tt-login-error" role="alert">
            {error}
          </p>
        )}

        {webAuthnSupported && hasPasskey && (
          <>
            <button type="button" className="tt-button tt-login-primary" onClick={() => void loginWithPasskey()} disabled={busy}>
              Sign in with passkey
            </button>
            <div className="tt-login-divider">or</div>
          </>
        )}

        <form onSubmit={(e) => void loginWithPassword(e)} className="tt-login-form">
          <label className="visually-hidden" htmlFor="password">
            Password
          </label>
          <input id="password" type="password" name="password" autoComplete="current-password" placeholder="Password" />
          <button type="submit" className="tt-button tt-button--plain" disabled={busy}>
            Sign in with password
          </button>
        </form>
      </div>
    </main>
  )
}
