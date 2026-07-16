import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 p-4 rounded-xl bg-blue-600 text-white shadow-lg flex items-center justify-between gap-3 z-50">
      <span className="text-sm font-medium">Update</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="px-4 py-2 rounded-lg bg-white text-blue-600 text-sm font-bold active:bg-blue-50 transition-colors"
      >
        Reload
      </button>
    </div>
  )
}
