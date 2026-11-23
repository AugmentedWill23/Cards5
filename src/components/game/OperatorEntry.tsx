'use client'
import { useEffect, useState } from 'react'
import { Button, Field, Modal } from './ui'
import { Icon } from './icons'

export function OperatorEntry() {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const show = () => {
      setPassword('')
      setError('')
      setOpen(true)
    }
    const key = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key === '|' && !event.repeat) {
        event.preventDefault()
        show()
      }
    }
    window.addEventListener('keydown', key)
    window.addEventListener('vault-operator-entry', show)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('vault-operator-entry', show)
    }
  }, [])
  if (!open) return null
  return (
    <Modal
      title="Operator access"
      subtitle="Authorized staff only · server-verified access"
      onClose={() => setOpen(false)}
    >
      <Icon name="shield" size={30} className="mb-4 text-[#bba0ed]" />
      <p className="mb-5 text-xs leading-6 text-[#a18aae]">
        An explicitly assigned Supabase operator identity is required. If configured, enter the
        additional private password. This shortcut never grants staff permissions.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          try {
            const response = await fetch('/api/operator', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error)
            setPassword('')
            window.location.assign(result.destination)
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Unable to unlock')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Operator password · if configured">
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            maxLength={256}
            className="w-full rounded-lg border border-white/10 bg-[#101016] px-3 py-3 text-sm text-white"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="mb-4 text-xs leading-6 text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Checking access…' : 'Unlock operator console'}
        </Button>
      </form>
      <a href="/operator" className="mt-5 block text-center text-xs text-[#bba0ed] underline">
        Supabase operator console
      </a>
      <p className="mt-4 text-[10px] leading-5 text-[#776283]">
        Sign in through the game first. Supabase staff roles are assigned explicitly, never from a
        display name, public signup, or the legacy CMS session.
      </p>
    </Modal>
  )
}
