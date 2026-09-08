// Light and dark, with "system" meaning the phone's setting rather than a third palette.
//
// The choice is resolved to a concrete theme here and stamped on the root element, so CSS only
// ever has to know about two states. Following the system live matters more on a phone than it
// looks: iOS flips to dark on a schedule, and an app that only read the preference at launch
// would sit in the wrong theme until it was force-quit.

export const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const query = () =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

export const systemTheme = () => (query()?.matches ? 'light' : 'dark')

/** The theme actually in force, given a preference. */
export const resolveTheme = pref => (pref === 'light' || pref === 'dark' ? pref : systemTheme())

/**
 * Apply a preference to the document.
 *
 * The address-bar colour is set alongside, because a dark browser chrome above a white page is
 * the tell that a PWA has only half-implemented its theme.
 */
export function applyTheme(pref) {
  const theme = resolveTheme(pref)
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f6f8' : '#0d1117')
  return theme
}

/** Call `fn` whenever the system preference changes. Returns an unsubscribe. */
export function watchSystem(fn) {
  const q = query()
  if (!q) return () => {}
  const handler = () => fn(systemTheme())
  // Safari below 14 only has the deprecated form, and this runs on a phone.
  if (q.addEventListener) q.addEventListener('change', handler)
  else q.addListener(handler)
  return () => {
    if (q.removeEventListener) q.removeEventListener('change', handler)
    else q.removeListener(handler)
  }
}
