import { ref } from 'vue'
import { packBackup } from './thread'

const KEY = 'llc:backed-up-at'

function remembered() {
  try {
    const at = new Date(localStorage.getItem(KEY) || '')
    return Number.isNaN(at.getTime()) ? null : at
  } catch { return null }
}

/** When what this browser keeps was last put in a backup file, or taken from one. */
export const backedUpAt = ref(remembered())

export function noteBackup(at = new Date()) {
  try { localStorage.setItem(KEY, at.toISOString()) }
  catch { /* The backup can still be downloaded. */ }
  backedUpAt.value = at
}

/** Hands over a backup file of everything this browser keeps. */
export async function downloadBackup() {
  const file = await packBackup()
  const at = new Date()
  const day = [at.getFullYear(), at.getMonth() + 1, at.getDate()].map((part) => String(part).padStart(2, '0')).join('-')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([file], { type: 'application/zip' }))
  link.download = `language-coach-backup-${day}.zip`
  link.click()
  URL.revokeObjectURL(link.href)
  noteBackup(at)
}
