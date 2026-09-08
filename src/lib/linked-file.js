// Linking the Hevy export once, instead of picking it every time.
//
// Hevy overwrites the same file on every export, so the path never changes — which makes
// re-picking it through a file dialog pure ceremony. The File System Access API can hold a
// handle to that file across sessions and re-read whatever is at the path now, turning the
// weekly import into one button.
//
// It is not available everywhere, and the places it is missing are the ones that matter most
// here: Chrome for Android and Safari on iOS both lack `showOpenFilePicker` entirely. So this
// is strictly an enhancement — every screen that uses it keeps the file-input path working and
// only offers linking when the browser can honour it. Feature-detect, never assume.
import { get, set, del } from 'idb-keyval'

const KEY = 'baseline-linked-csv'

/** Whether this browser can hold a file handle at all. Desktop Chrome, Edge and Opera can. */
export const canLink = () =>
  typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'

/**
 * Ask for the export file and remember it.
 *
 * The handle is stored in IndexedDB rather than kept in memory: the whole point is that it
 * survives closing the app, so next week's import is a button and not a dialog.
 */
export async function linkFile() {
  const [handle] = await window.showOpenFilePicker({
    id: 'hevy-export',            // the picker reopens in the same folder next time
    multiple: false,
    types: [{
      description: 'Hevy export',
      accept: { 'text/csv': ['.csv'], 'application/xml': ['.xml'], 'text/xml': ['.xml'] },
    }],
  })
  await set(KEY, handle)
  return handle
}

/** The handle from last time, or null. */
export const linkedFile = () => get(KEY)

export const forgetLink = () => del(KEY)

/**
 * Read whatever is at the linked path right now.
 *
 * Permission is checked before it is requested: a granted handle re-reads silently, which is
 * the behaviour that makes the button worth having. A revoked one — Chrome drops permissions
 * when the origin has not been visited for a while — asks again, and that request has to happen
 * inside a click, which is why this is called straight from the handler.
 *
 * @returns {{text: string, name: string, lastModified: number}}
 * @throws {Error} With a message fit to show, including the case where the file is gone.
 */
export async function readLinked(handle) {
  const opts = { mode: 'read' }
  // Early implementations shipped handles without the permission methods at all; treat that as
  // "already allowed" rather than refusing, since there is nothing to ask.
  if (handle.queryPermission || handle.requestPermission) {
    let state = await handle.queryPermission?.(opts)
    if (state !== 'granted') state = await handle.requestPermission?.(opts)
    if (state !== 'granted') {
      throw new Error('Permission to read that file was declined. Link it again to restore access.')
    }
  }

  let file
  try {
    file = await handle.getFile()
  } catch {
    // The usual cause is the file having been moved, renamed or deleted since it was linked.
    throw new Error(`${handle.name} could not be read — it may have been moved or deleted. Link it again.`)
  }
  return { text: await file.text(), name: file.name, lastModified: file.lastModified }
}
