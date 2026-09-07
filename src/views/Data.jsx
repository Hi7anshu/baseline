import { useRef, useState } from 'react'
import { parseImport, mergeImport } from '../vendor/lib/import-csv.js'
import { remapParsed, reresolveCustoms } from '../lib/match.js'
import { sync, fetchUser, HevyError } from '../lib/hevy.js'
import { exportJSON, emptyState } from '../lib/store.js'
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
        <p className="p">
          Everything lives in this browser and on Hevy's servers. Nothing is uploaded anywhere else
          and no server holds a copy, so there is nothing to keep running.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={() => exportJSON(S, settings)}>Export backup</button>
          <button className="btn danger" onClick={onClear}>Clear local copy</button>
        </div>
      </section>

      <section className="card">
        <p className="foot">
          Fatigue, recovery and detraining maths are from{' '}
          <a href="https://github.com/DuarteSantos8/openGym" target="_blank" rel="noreferrer">openGym</a>{' '}
          by Duarte Santos (AGPL-3.0), used here unmodified. Body geometry from MuscleMap by
          Melih Colpan (MIT). This app only reads Hevy — it never writes to your log.
        </p>
      </section>
    </>
  )
}
