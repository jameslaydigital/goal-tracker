import { db } from './db'

export function generateId(): string {
  return crypto.randomUUID()
}

export async function exportSessionsToCSV(): Promise<void> {
  const allSets = await db.sessionSets.toArray()
  const sets = allSets.filter(s => s.logged)

  sets.sort((a, b) => {
    const da = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const db_ = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return da - db_
  })

  const rows: string[][] = [['datetime', 'session_name', 'exercise_name', 'set_number', 'reps', 'weight', 'weight_unit']]

  for (const set of sets) {
    if (!set.completedAt) continue
    const date = new Date(set.completedAt)
    const iso = date.toISOString().replace('T', ' ').slice(0, 19)
    rows.push([iso, set.sessionName, set.exerciseName, String(set.order + 1), String(set.reps), String(set.weight), set.weightUnit])
  }

  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const file = new File([blob], `workout-export-${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv' })

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }
}
