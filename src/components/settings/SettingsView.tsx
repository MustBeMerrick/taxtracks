'use client'

import { startRegistration } from '@simplewebauthn/browser'
import { Download, KeyRound, LogOut, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clearAllData, resetToSample, restoreBackup, type ActionResult } from '@/app/actions'
import { useTheme } from '@/components/app/ThemeProvider'
import type { ThemePreference } from '@/components/app/theme'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import type { AuditEvent } from '@/lib/core/types'
import { useScheduleRefresh } from '@/lib/refresh-context'
import '@/components/settings/settings.css'

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export interface SettingsData {
  isSample: boolean
  counts: { paychecks: number; investments: number; runs: number }
  audit: AuditEvent[]
}

export function SettingsView({ data }: { data: SettingsData }) {
  return (
    <div className="tt-settings">
      <DataSection data={data} />
      <SecuritySection />
      <AppearanceSection />
      <ChangeLog events={data.audit} />
    </div>
  )
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

function DataSection({ data }: { data: SettingsData }) {
  const scheduleRefresh = useScheduleRefresh()
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, setPending] = useState<{ name: string; json: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setPending({ name: file.name, json: await file.text() })
    setNotice(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function run(action: () => Promise<ActionResult>) {
    try {
      const result = await action()
      setNotice({ tone: result.ok ? 'ok' : 'error', text: result.message })
      scheduleRefresh()
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' })
    }
  }

  const { counts } = data
  return (
    <Card title="Data" className="tt-settings-data">
      <p className="tt-settings-lead">
        Stored on the Tax Tracks server{data.isSample ? ' (currently the bundled sample data)' : ''}, shared by every device you sign in from.{' '}
        <span className="tt-muted">
          {counts.paychecks} paychecks · {counts.investments} investment sources · {counts.runs} saved calculations
        </span>
      </p>

      <div className="tt-settings-actions">
        <SettingRow icon={<Download size={18} />} title="Export backup" detail="Download everything as a JSON file.">
          {/* A plain link: the route handler sets Content-Disposition so the browser downloads it. */}
          <a className="tt-button" href="/api/export" download>
            Export
          </a>
        </SettingRow>

        <SettingRow icon={<Upload size={18} />} title="Restore from backup" detail="Replaces all current data with the file's contents.">
          <input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" id="tt-import" onChange={(e) => void chooseFile(e.target.files?.[0])} />
          <label htmlFor="tt-import" className="tt-button tt-button--plain">
            Choose file…
          </label>
        </SettingRow>

        {pending && (
          <div className="tt-confirm" role="alert">
            <p>
              Restore from <strong>{pending.name}</strong>? Current data will be replaced.
            </p>
            <div>
              <button
                type="button"
                className="tt-button tt-button--danger"
                onClick={() => {
                  const { json } = pending
                  setPending(null)
                  void run(() => restoreBackup(json))
                }}
              >
                Replace data
              </button>
              <button type="button" className="tt-button tt-button--plain" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <SettingRow icon={<RotateCcw size={18} />} title="Reset to sample data" detail="Replaces all data with the demo household.">
          <ConfirmButton label="Reset" confirmLabel="Replace with sample" onConfirm={() => void run(resetToSample)} />
        </SettingRow>

        <SettingRow icon={<Trash2 size={18} />} title="Clear all data" detail="Start fresh with an empty household. Export a backup first if you might need it.">
          <ConfirmButton label="Clear" confirmLabel="Delete everything" onConfirm={() => void run(clearAllData)} />
        </SettingRow>
      </div>

      {notice && (
        <p className={`tt-notice tt-notice--${notice.tone}`} role="status">
          {notice.text}
        </p>
      )}
    </Card>
  )
}

interface PasskeySummary {
  id: string
  label: string | null
  createdAt: string
}

function SecuritySection() {
  const router = useRouter()
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function loadPasskeys() {
    fetch('/api/auth/passkey')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { credentials: PasskeySummary[] }) => setPasskeys(d.credentials))
      .catch(() => setPasskeys([]))
  }

  useEffect(loadPasskeys, [])

  async function registerPasskey() {
    setStatus(null)
    setBusy(true)
    try {
      const optionsResponse = await fetch('/api/auth/passkey/register/options', { method: 'POST' })
      if (!optionsResponse.ok) throw new Error()
      const attestation = await startRegistration({ optionsJSON: await optionsResponse.json() })
      // Ask for a label only after the WebAuthn ceremony: a dialog before
      // startRegistration() can eat the user gesture iOS Safari requires.
      const label = window.prompt('Name this passkey (e.g. "iPhone", "Mac mini")') ?? undefined
      const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, ...attestation }),
      })
      if (!verifyResponse.ok) throw new Error()
      setStatus('Passkey registered for this device.')
      loadPasskeys()
    } catch {
      setStatus('Could not register a passkey on this device. Passkeys only work at the address set in APP_URL.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/auth/passkey/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (response.ok) setPasskeys((current) => current?.filter((p) => p.id !== id) ?? null)
    else setStatus('Could not revoke that passkey.')
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <Card title="Security">
      <div className="tt-settings-actions">
        <SettingRow icon={<KeyRound size={18} />} title="Passkeys" detail="Sign in with Face ID or Touch ID instead of the password.">
          <button type="button" className="tt-button" onClick={() => void registerPasskey()} disabled={busy}>
            Add passkey
          </button>
        </SettingRow>
        {passkeys?.map((p) => (
          <div key={p.id} className="tt-setting-row tt-passkey">
            <span />
            <div className="tt-setting-text">
              <strong>{p.label || 'Unnamed passkey'}</strong>
              <span>Added {new Date(`${p.createdAt}Z`).toLocaleDateString()}</span>
            </div>
            <div className="tt-setting-control">
              <ConfirmButton label="Revoke" confirmLabel="Revoke passkey" onConfirm={() => void revoke(p.id)} />
            </div>
          </div>
        ))}
        <SettingRow icon={<LogOut size={18} />} title="Sign out" detail="Ends the session on this device.">
          <button type="button" className="tt-button tt-button--plain" onClick={() => void signOut()}>
            Sign out
          </button>
        </SettingRow>
      </div>
      {status && (
        <p className="tt-notice tt-notice--ok" role="status">
          {status}
        </p>
      )}
    </Card>
  )
}

function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button type="button" className="tt-button tt-button--plain" onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }
  return (
    <span className="tt-confirm-inline">
      <button
        type="button"
        className="tt-button tt-button--danger"
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="tt-button tt-button--plain" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  )
}

function SettingRow({ icon, title, detail, children }: { icon: ReactNode; title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="tt-setting-row">
      <span className="tt-setting-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="tt-setting-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="tt-setting-control">{children}</div>
    </div>
  )
}

function AppearanceSection() {
  const { preference, setPreference } = useTheme()
  return (
    <Card title="Appearance">
      <Segmented<ThemePreference>
        label="Theme"
        className="tt-settings-theme"
        value={preference}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={setPreference}
      />
    </Card>
  )
}

function ChangeLog({ events }: { events: AuditEvent[] }) {
  return (
    <Card title="Change log">
      {events.length === 0 ? (
        <p className="tt-muted">No changes recorded yet.</p>
      ) : (
        <ul className="tt-changelog">
          {events.map((e) => (
            <li key={e.id}>
              <time dateTime={e.at}>{dateTime.format(new Date(e.at))}</time>
              <span>{e.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
