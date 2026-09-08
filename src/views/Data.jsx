import { useRef, useState } from 'react'
import { parseImport, parseBodyweight, mergeImport } from '../vendor/lib/import-csv.js'
import { remapParsed, reresolveCustoms } from '../lib/match.js'
import { sync, fetchUser, HevyError } from '../lib/hevy.js'
import { exportJSON, parseBackup, emptyState } from '../lib/store.js'
import { THEMES, resolveTheme } from '../lib/theme.js'
import Unidentified from './Unidentified.jsx'

/**
 * Getting training in, and back out.
 *
 * Two routes, same destination. The CSV export works on any Hevy account; the developer API
 * needs Hevy Pro but keeps itself current without you doing anything. Both land in the same
 * state, so switching later costs nothing.
 */
export default function Data({ S, settings, commitState, commitSettings }) {
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  const [key, setKey] = useState(settings.apiKey || '')
  const file = useRef(null)
  const weightFile = useRef(null)
  const backupFile = useRef(null)

  const done = (text, unmatched) => { setMsg({ text, unmatched }); setErr(null); setBusy(null) }
  const failed = text => { setErr(text); setMsg(null); setBusy(null) }

  async function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy('Reading file…'); setErr(null); setMsg(null)
    try {
      // The vendored parser matches exercises internally, so the overlay is applied to its
      // result rather than injected into it — see remapParsed.
      const parsed = remapParsed(parseImport(await f.text(), { unit: 'kg' }), S.overrides)
      if (parsed.error) {
        failed(parsed.error === 'empty'
          ? 'That file is empty.'
          : 'That file was not recognised as a Hevy, Strong or FitNotes export.')
        return
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
      done(
        parsed.kind === 'bodyweight'
          ? `Added ${result.added} body-weight entries.`
          : `${result.added - replaced} new workouts, ${replaced} refreshed — ${next.workouts.length} total.`,
        parsed.unmatchedNames,
      )
    } catch (ex) {
      failed(ex.message || 'Could not read that file.')
    } finally {
      if (file.current) file.current.value = ''
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

  async function onSync() {
    if (!key.trim()) return failed('Paste your Hevy API key first.')
    setBusy('Connecting…'); setErr(null); setMsg(null)
    try {
      await fetchUser(key.trim())
      const startedAt = new Date().toISOString()
      const { state, stats } = await sync(S, { ...settings, apiKey: key.trim() }, { onProgress: setBusy })
      await commitState(state)
      await commitSettings({ ...settings, apiKey: key.trim(), lastSync: startedAt })
      done(`Synced. ${stats.added} workouts in, ${stats.deleted} removed, ${stats.total} total.`)
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

  async function onClear() {
    if (!confirm('Clear the local copy? Your Hevy account is untouched — re-import or re-sync brings it all back.')) return
    await commitState(emptyState())
    await commitSettings({ ...settings, lastSync: null })
    done('Local copy cleared.')
  }

  return (
    <>
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
        <button className="btn" disabled={!!busy} onClick={onSync}>
          {settings.lastSync ? 'Sync now' : 'Connect and sync'}
        </button>
        {settings.lastSync && (
          <p className="foot">Last synced {new Date(settings.lastSync).toLocaleString()}.</p>
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
        <p className="p">
          Everything lives in this browser and on Hevy's servers. Nothing is uploaded anywhere else
          and no server holds a copy, so there is nothing to keep running.
        </p>
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
