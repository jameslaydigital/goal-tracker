import { useState, type FormEvent, type ReactNode } from 'react'

interface BaseProps {
  title: string
  message?: string
  onClose: () => void
}

export interface PromptDialogProps extends BaseProps {
  defaultValue?: string
  placeholder?: string
  submitLabel: string
  onSubmit: (value: string) => Promise<void> | void
}

export function PromptDialog({ title, message, defaultValue = '', placeholder, submitLabel, onSubmit, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || !value.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(value)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={busy ? undefined : onClose}>
      <h2 className="text-surface-50 font-semibold text-lg">{title}</h2>
      {message && <p className="text-surface-400 text-sm mt-1">{message}</p>}
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 rounded-xl bg-surface-900 text-surface-50 placeholder:text-surface-500 outline-none focus:ring-2 focus:ring-surface-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-surface-400 active:text-surface-200">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !value.trim()}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Overlay>
  )
}

export interface ConfirmDialogProps extends BaseProps {
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
}

export function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay onClose={busy ? undefined : onClose}>
      <h2 className="text-surface-50 font-semibold text-lg">{title}</h2>
      {message && <p className="text-surface-400 text-sm mt-2">{message}</p>}
      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-surface-400 active:text-surface-200">
          Cancel
        </button>
        <button
          onClick={() => void handleConfirm()}
          disabled={busy}
          className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60 ${
            danger ? 'bg-red-600 active:bg-red-500' : 'bg-blue-600 active:bg-blue-500'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface-800 rounded-2xl p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
