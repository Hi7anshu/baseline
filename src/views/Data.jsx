import { useEffect, useMemo, useRef, useState } from 'react'
import { parseImport, parseBodyweight, mergeImport } from '../vendor/lib/import-csv.js'
import { remapParsed, reresolveCustoms } from '../lib/match.js'
import { sync, fetchUser, HevyError } from '../lib/hevy.js'
import { exportJSON, parseBackup, emptyState } from '../lib/store.js'
import { THEMES, resolveTheme } from '../lib/theme.js'
import { canLink, linkFile, linkedFile, readLinked, forgetLink } from '../lib/linked-file.js'
import { dataAge, agoLabel, STALE_DAYS } from '../lib/freshness.js'
import { buildDigest, DIGEST_PROMPT } from '../lib/digest.js'
import Unidentified from './Unidentified.jsx'

/**
 * Getting training in, and back out.
 *
 * Two routes, same destination. The CSV export works on any Hevy account; the developer API
 * needs Hevy Pro but keeps itself current without you doing anything. Both land in the same
 * state, so switching later costs nothing.
 */
export default function Data({ S, settings, fatigue, commitState, commitSettings }) {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [key, setKey] = useState(settings.apiKey || '')
  const file = useRef(null)
  const weightFile = useRef(null)
  const backupFile = useRef(null)
  const [linked, setLinked] = useState(null)

  const age = useMemo(() => dataAge(S), [S.workouts])

  // Only asked for where the API exists; on Android and iOS this stays null and the card that
  // uses it never renders.
  useEffect(() => { if (canLink()) linkedFile().then(h => setLinked(h || null)) }, [])

  const done = (text, unmatched) => { setMsg({ text, unmatched }); setErr(null); setBusy(null) }
  const failed = text => { setErr(text); setMsg(null); setBusy(null) }

  async function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy('Reading file…')
    await importText(await f.text())
    if (file.current) file.current.value = ''
  }

  // Re-read the linked export and import whatever is in it now. The permission prompt, if one
  // is needed, has to happen inside this click — hence no awaits before readLinked.
  async function onRefresh() {
    if (!linked) return
    setBusy('Reading the linked file…'); setErr(null); setMsg(null)
    try {
      const { text, name, lastModified } = await readLinked(linked)
      const saved = await importText(text, `${name}, saved ${agoLabel(daysSince(lastModified))}`)
      if (saved) await commitSettings({ ...settings, lastImport: new Date().toISOString() })
    } catch (ex) {
      failed(ex.message || 'Could not read the linked file.')
    }
  }

  async function onLink() {
    setErr(null); setMsg(null)
    try {
      const handle = await linkFile()
      setLinked(handle)
      setBusy('Reading the linked file…')
      const { text, name, lastModified } = await readLinked(handle)
      await importText(text, `${name}, saved ${agoLabel(daysSince(lastModified))}`)
    } catch (ex) {
      // An abandoned picker is a decision, not a failure.
      if (ex?.name === 'AbortError') { setBusy(null); return }
      failed(ex.message || 'Could not link that file.')
    }
  }

  async function onUnlink() {
    await forgetLink()
    setLinked(null)
    done('File unlinked. The import above still works.')
  }

  /**
   * Parse and merge one export, whatever handed it over.
   *
   * @param {string} text Raw file contents.
   * @param {string} [source] Named in the result line, so a refresh can say which file and when
   *   it was written — the one thing that distinguishes "nothing new" from "wrong file".
   * @returns {boolean} Whether anything was imported.
   */
  async function importText(text, source) {
    setErr(null); setMsg(null)
    try {
      // The vendored parser matches exercises internally, so the overlay is applied to its
      // result rather than injected into it — see remapParsed.
      const parsed = remapParsed(parseImport(text, { unit: 'kg' }), S.overrides)
      if (parsed.error) {
        failed(parsed.error === 'empty'
          ? 'That file is empty.'
          : 'That file was not recognised as a Hevy, Strong or FitNotes export.')
        return false
      }
      // mergeImport mutates, so hand it a copy and commit the result — React state stays immutable.
      const next = structuredClone(S)

      // Upstream's merge skips any date it already holds, which is right when you are combining
      // exports from different apps. Hevy's export is the *whole* history every time, so here it
      // would instead freeze the first version of a day: add sets to today's session in Hevy,
      // re-export, and the correction would be silently discarded. Dropping the overlapping
      // dates first makes the incoming file authoritative for every day it covers.
      let replaced = 0
      if (parsed.kind === 'workouts') {
        const incoming = new Set(parsed.workouts.map(w => w.d))
        const before = next.workouts.length
        next.workouts = next.workouts.filter(w => !incoming.has(w.d))
        replaced = before - next.workouts.length
      }

      const result = mergeImport(next, parsed)
      await commitState(reresolveCustoms(next))
      const added = result.added - replaced
      done(
        parsed.kind === 'bodyweight'
          ? `Added ${result.added} body-weight entries.`
          : `${added} new workout${added === 1 ? '' : 's'}, ${replaced} refreshed — `
            + `${next.workouts.length} total.${source ? ` From ${source}.` : ''}`,
        parsed.unmatchedNames,
      )
      return true
    } catch (ex) {
      failed(ex.message || 'Could not read that file.')
      return false
    }
  }

  async function onWeightFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy('Reading file…'); setErr(null); setMsg(null)
    try {
      // Forced rather than auto-detected: a two-column date+weight CSV is ambiguous enough that
      // parseImport can read it as a workout file and find nothing.
      const parsed = parseBodyweight(await f.text(), { unit: 'kg' })
      if (parsed.error || !parsed.bodyweight?.length) {
        failed('No weights found. Expected a Hevy measurements export, an Apple Health export, or a CSV with a date and a weight column.')
        return
      }
      const byDate = new Map((S.bodyweight || []).map(b => [b.d, b]))
      for (const b of parsed.bodyweight) byDate.set(b.d, b)
      const bodyweight = [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : 1))
      const added = bodyweight.length - (S.bodyweight?.length || 0)
      await commitState({ ...S, bodyweight })
      done(`${added} new weigh-ins, ${parsed.bodyweight.length - added} updated — ${bodyweight.length} total.`)
    } catch (ex) {
      failed(ex.message || 'Could not read that file.')
    } finally {
      if (weightFile.current) weightFile.current.value = ''
    }
  }

  /**
   * Pull from Hevy.
   *
   * `full` asks for the whole history instead of the changes since last time, which is how a
   * matching fix reaches training that is already on the device. Identification happens at
   * import: an entry stores a catalogue id and nothing about the name it came from, so when the
   * matcher improves there is no way to re-read the old rows — they have to come again. Merging
   * is by Hevy id, so this replaces each workout rather than duplicating it, and measurements,
   * nutrition and sleep are not touched at all.
   */
  async function onSync(full = false) {
    if (!key.trim()) return failed('Paste your Hevy API key first.')
    setBusy('Connecting…'); setErr(null); setMsg(null)
    try {
      await fetchUser(key.trim())
      const startedAt = new Date().toISOString()
      const from = { ...settings, apiKey: key.trim(), lastSync: full ? null : settings.lastSync }
      const { state, stats } = await sync(S, from, { onProgress: setBusy })
      await commitState(state)
      await commitSettings({ ...settings, apiKey: key.trim(), lastSync: startedAt })
      done(full
        ? `Re-read ${stats.added} workouts — ${stats.total} on file. Anything the matcher can now place has been placed.`
        : `Synced. ${stats.added} workouts in, ${stats.deleted} removed, ${stats.total} total.`)
    } catch (ex) {
      failed(ex instanceof HevyError ? ex.message : (ex.message || 'Sync failed.'))
    }
  }

  // A restore replaces everything. That is stated in the confirm rather than softened, because
  // measurements and nutrition live only here — Hevy has never held them, so an accidental
  // restore over a month of logging is not recoverable from anywhere.
  async function onBackupFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy('Reading backup…'); setErr(null); setMsg(null)
    try {
      const { state, settings: restored, counts } = parseBackup(await f.text(), settings)
      const when = counts.exportedAt ? new Date(counts.exportedAt).toLocaleDateString() : 'an unknown date'
      const ok = confirm(
        `Restore the backup from ${when}?

`
        + `It holds ${counts.workouts} workouts, ${counts.bodyweight} weigh-ins, `
        + `${counts.measurements} measurements and ${counts.nutrition} logged days.

`
        + `This replaces what is on this device — you currently have ${S.workouts.length} workouts, `
        + `${S.measurements?.length || 0} measurements and ${S.nutrition?.length || 0} logged days. `
        + `Measurements and nutrition exist nowhere else, so anything not in the file is gone.`,
      )
      if (!ok) { setBusy(null); return }
      await commitState(reresolveCustoms(state))
      await commitSettings(restored)
      done(
        `Restored ${counts.workouts} workouts, ${counts.measurements} measurements and `
        + `${counts.nutrition} logged days.`,
      )
    } catch (ex) {
      failed(ex.message || 'Could not read that backup.')
    } finally {
      if (backupFile.current) backupFile.current.value = ''
    }
  }

  /**
   * Throw away the cached app and load the deployed one.
   *
   * Installed as a PWA, the service worker serves the build it already has and only picks up a
   * new one on its own schedule — so a fix can be live and the phone still running last week's
   * code. That looks exactly like the fix not working, and the difference is invisible without
   * this. Only the app shell is cached; training lives in IndexedDB and is not touched.
   */
  async function onUpdate() {
    setBusy('Fetching the latest version…'); setErr(null); setMsg(null)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      if (window.caches) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
      location.reload()
    } catch (ex) {
      failed(ex.message || 'Could not fetch an update. Close the app fully and reopen it.')
    }
  }

  async function onClear() {
    if (!confirm('Clear the local copy? Your Hevy account is untouched — re-import or re-sync brings it all back.')) return
    await commitState(emptyState())
    await commitSettings({ ...settings, lastSync: null })
    done('Local copy cleared.')
  }

  return (
    <>
      {age.stale && !age.empty && (
        <div className="note busy">
          Newest workout is from {age.newest} — {agoLabel(age.days)}. Fatigue decays with the
          clock whether or not anything is imported, so after {STALE_DAYS} days the maps drift
          toward "everything ready" simply because nothing new has arrived. Re-export and import
          before reading them.
        </div>
      )}

      {canLink() && (
        <section className="card">
          <h2 className="c-h">Linked export</h2>
          {linked ? (
            <>
              <p className="p">
                Linked to <strong>{linked.name}</strong>. Hevy overwrites the same file every
                time you export, so this re-reads whatever is at that path now — no picker.
              </p>
              <div className="btn-row">
                <button className="btn primary" disabled={!!busy} onClick={onRefresh}>Refresh now</button>
                <button className="btn" disabled={!!busy} onClick={onUnlink}>Unlink</button>
              </div>
            </>
          ) : (
            <>
              <p className="p">
                Pick your Hevy export once and this remembers the file. Every export after that
                is one button — the file is re-read in place, so it always imports the newest
                version.
              </p>
              <button className="btn primary" disabled={!!busy} onClick={onLink}>Link export file</button>
            </>
          )}
          <p className="foot">
            Only the reference to the file is stored, and only on this device. Nothing is
            uploaded, and the app can read it only when you press Refresh.
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="c-h">Import from Hevy</h2>
        <p className="p">
          In Hevy: <strong>Settings → Export &amp; Import Data → Export Workout Data</strong>. Save the
          CSV, then pick it here. Importing again later only adds what is new.
        </p>
        <input ref={file} type="file" accept=".csv,.xml,text/csv" onChange={onFile} hidden />
        <button className="btn primary" disabled={!!busy} onClick={() => file.current?.click()}>
          Choose CSV file
        </button>
      </section>

      <section className="card">
        <h2 className="c-h">Import body weight</h2>
        <p className="p">
          A Hevy measurements export, an Apple Health export, or any CSV with a date and a weight.
          Weights feed the body-composition maths and the load on bodyweight exercises.
        </p>
        <input ref={weightFile} type="file" accept=".csv,.xml,text/csv" onChange={onWeightFile} hidden />
        <button className="btn" disabled={!!busy} onClick={() => weightFile.current?.click()}>
          Choose weight file
        </button>
        <p className="foot">
          On free Hevy only weight and waist can be recorded at all — everything else is logged
          under <strong>Body</strong> here instead.
        </p>
      </section>

      <section className="card">
        <h2 className="c-h">Automatic sync <span className="tag">Hevy Pro</span></h2>
        <p className="p">
          With Pro you get a developer key at <strong>hevy.com/settings?developer</strong>. Paste it
          here and the app pulls new and edited workouts by itself — no exporting.
        </p>
        <input
          className="input"
          type="password"
          placeholder="Hevy API key"
          value={key}
          autoComplete="off"
          spellCheck={false}
          onChange={e => setKey(e.target.value)}
        />
        <button className="btn" disabled={!!busy} onClick={() => onSync(false)}>
          {settings.lastSync ? 'Sync now' : 'Connect and sync'}
        </button>
        {settings.lastSync && (
          <>
            <p className="foot">Last synced {new Date(settings.lastSync).toLocaleString()}.</p>
            <button className="btn small" disabled={!!busy} onClick={() => onSync(true)}>
              Re-read everything
            </button>
            <p className="foot">
              A normal sync only asks for what changed in Hevy, so a workout already here keeps
              whatever exercises it was matched to on the day it arrived. When identification
              improves — or you correct something in Unidentified — this pulls the full history
              again and re-matches it. Slower, safe to repeat, and it leaves measurements,
              nutrition and sleep alone.
            </p>
          </>
        )}
        <p className="foot">
          The key is stored on this device only and goes nowhere but Hevy. Without Pro the key is
          rejected — use the CSV import above.
        </p>
      </section>

      {busy && <div className="note busy">{busy}</div>}
      {err && <div className="note err">{err}</div>}
      {msg && (
        <div className="note ok">
          {msg.text}
          {msg.unmatched?.length > 0 && (
            <details>
              <summary>{msg.unmatched.length} exercises could not be identified</summary>
              <p className="foot">
                A Hevy CSV carries no muscle information, so these are left out of the fatigue
                maps rather than guessed at — a wrong reading gets acted on, a missing one does
                not. Identify them below and it is applied to this history immediately.
              </p>
              <ul className="unmatched">{msg.unmatched.map(n => <li key={n}>{n}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      <Unidentified S={S} commitState={commitState} />

      <section className="card">
        <h2 className="c-h">Your data</h2>
        <div className="verdict">
          <div className="v-col"><span className="v-n">{S.workouts.length}</span><span className="v-l">workouts</span></div>
          <div className="v-col"><span className="v-n">{S.customEx?.length || 0}</span><span className="v-l">custom lifts</span></div>
          <div className="v-col"><span className="v-n">{S.bodyweight?.length || 0}</span><span className="v-l">weigh-ins</span></div>
        </div>
        <div className="verdict">
          <div className="v-col"><span className="v-n">{S.measurements?.length || 0}</span><span className="v-l">measurements</span></div>
          <div className="v-col"><span className="v-n">{S.nutrition?.length || 0}</span><span className="v-l">days logged</span></div>
        </div>
        <p className="foot" style={{ margin: '0 0 14px' }}>
          {age.empty
            ? 'Nothing imported yet.'
            : `Newest workout ${age.newest} — ${agoLabel(age.days)}.`}
        </p>
        <p className="p">
          Everything lives in this browser and on Hevy's servers. Nothing is uploaded anywhere else
          and no server holds a copy, so there is nothing to keep running.
        </p>
        <p className="foot">
          App version <strong>{__BUILD__}</strong>. Installed to the home screen, this can sit a
          version or two behind what is deployed, which looks the same as a fix not working. If
          something was meant to be corrected and has not been, update first and import again —
          an import is matched by whichever version is loaded at the time.
        </p>
        <button className="btn small" disabled={!!busy} onClick={onUpdate}>Update the app</button>
        <input ref={backupFile} type="file" accept=".json,application/json" onChange={onBackupFile} hidden />
        <div className="btn-row">
          <button className="btn" onClick={() => exportJSON(S, settings)}>Export backup</button>
          <button className="btn" disabled={!!busy} onClick={() => backupFile.current?.click()}>
            Restore backup
          </button>
        </div>
        <p className="foot">
          Training can always be re-imported from Hevy. Measurements, nutrition and your profile
          cannot — they exist only on this device and in the backup file, so keep one somewhere
          that is not this phone. A restore replaces what is here rather than merging into it.
        </p>
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn danger" onClick={onClear}>Clear local copy</button>
        </div>
      </section>

      <Digest S={S} fatigue={fatigue} />

      <section className="card">
        <h2 className="c-h">Appearance</h2>
        <div className="seg">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={'seg-b' + ((settings.theme || 'system') === t.id ? ' on' : '')}
              onClick={() => commitSettings({ ...settings, theme: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="foot">
          System follows the phone, including when it changes on a schedule — currently{' '}
          {resolveTheme(settings.theme)}. The setting lives on this device with everything else.
        </p>
      </section>

      <section className="card">
        <p className="foot">
          Fatigue, recovery and detraining maths are from{' '}
          <a href="https://github.com/DuarteSantos8/openGym" target="_blank" rel="noreferrer">openGym</a>{' '}
          by Duarte Santos (AGPL-3.0), used here unmodified. Body geometry from MuscleMap by
          Melih Colpan (MIT). Baseline only reads Hevy — it never writes to your log. Body-fat
          estimates use the US Navy circumference method; the calorie estimate uses
          Mifflin-St Jeor. Both are estimates, not measurements.
        </p>
      </section>
    </>
  )
}

const daysSince = ms => Math.max(0, Math.floor((Date.now() - ms) / 86400000))

/**
 * Hand the data to Claude without handing it a key.
 *
 * There is no API call here and there is not going to be one: a Claude Pro or Max subscription
 * does not include API access — that is billed separately through the Anthropic console — and
 * this app is a static page in a public repo, so any key it carried would ship to every visitor
 * and there is no server to keep one on. Copying a written summary into a conversation you are
 * already signed into gets the same answer, costs nothing, and keeps the data on the device until
 * you choose to paste it.
 */
function Digest({ S, fatigue }) {
  const [days, setDays] = useState(30)
  const [copied, setCopied] = useState(null)
  const [preview, setPreview] = useState(false)

  const text = useMemo(() => buildDigest(S, fatigue, days), [S, fatigue, days])

  async function copy(what) {
    try {
      await navigator.clipboard.writeText(what === 'both' ? DIGEST_PROMPT + text : text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2400)
    } catch {
      setPreview(true)
    }
  }

  return (
    <section className="card">
      <div className="d-head">
        <h2 className="c-h">Ask Claude about all of it</h2>
        <div className="seg tight">
          {[14, 30, 90].map(d => (
            <button key={d} className={'seg-b' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>{d}d</button>
          ))}
        </div>
      </div>
      <p className="p">
        Writes {days} days of training, sleep, food, body and mood into one summary with a question
        attached, ready to paste into Claude. Nothing is sent from here — the app has no key and no
        server, so the data moves only when you paste it.
      </p>
      <div className="btn-row">
        <button className="btn primary" onClick={() => copy('both')}>
          {copied === 'both' ? 'Copied' : 'Copy question + data'}
        </button>
        <button className="btn" onClick={() => copy('data')}>
          {copied === 'data' ? 'Copied' : 'Data only'}
        </button>
      </div>
      <button className="btn" style={{ marginTop: 8 }} onClick={() => setPreview(p => !p)}>
        {preview ? 'Hide' : 'Show what gets copied'}
      </button>
      {preview && <pre className="prompt" style={{ marginTop: 12 }}>{text}</pre>}
      <p className="foot">
        A Claude subscription does not come with an API key — API access is billed separately
        through the Anthropic console — and a key inside a public static app would be readable by
        anyone who opened it. This is the version that works without either.
      </p>
    </section>
  )
}
