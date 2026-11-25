/**
 * A new version of the app may lay its databases out differently, and here that change is made in each person's
 * browser, where nobody can go and mend it. So the first start of a new version sets a copy of everything aside
 * before it begins, and a start that fails puts the copy back.
 */
import type { StoredFile } from './storage'

export interface Everything { databases: StoredFile[]; files: StoredFile[] }

/**
 * What the start reads and leaves. The version and the mark of a start that has not ended are kept among the
 * files, so putting a copy back also puts back what they said when it was made.
 */
export interface Kept {
  /** The version that last started with what is stored. */
  version(): string | undefined
  setVersion(version: string): void
  unfinished(): boolean
  setUnfinished(unfinished: boolean): void
  everything(): Everything
  replace(all: Everything): Promise<void>
  /** Leaves the copy where it outlasts a page closed in the middle of the start. */
  setAside(all: Everything): Promise<void>
  copySetAside(): Promise<Everything | undefined>
}

/** The start failed, and everything stored is as it was before it. */
export class PutBack extends Error {
  constructor(readonly why: unknown) {
    super('The start failed and everything was put back')
  }
}

export async function startKeepingCopy(kept: Kept, version: string, start: () => Promise<void>) {
  let before: Everything | undefined
  if (kept.unfinished()) {
    // The page was closed while a new version was starting, so what is stored may be half changed.
    before = await kept.copySetAside()
    if (before) await kept.replace(before)
  } else if (kept.version() !== version) {
    const all = kept.everything()
    // Someone new has nothing to lose.
    if (all.databases.length) {
      await kept.setAside(all)
      before = all
    }
  }
  if (before) kept.setUnfinished(true)
  try {
    await start()
  } catch (error) {
    if (!before) throw error
    await kept.replace(before)
    throw new PutBack(error)
  }
  kept.setUnfinished(false)
  kept.setVersion(version)
}
