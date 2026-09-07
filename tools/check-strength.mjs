import { readFileSync } from 'node:fs'
import { parseImport, mergeImport } from '../src/vendor/lib/import-csv.js'
import { remapParsed } from '../src/lib/match.js'
import { registerCustom } from '../src/vendor/lib/exercises.js'
import { strengthProgress, recentRecords, movers } from '../src/lib/strength.js'

const S = { workouts: [], customEx: [], bodyweight: [], exWeights: {}, overrides: {}, unit: 'kg' }
const parsed = remapParsed(parseImport(readFileSync(process.argv[2] || 'hevy-fixture.csv', 'utf8'), { unit: 'kg' }))
mergeImport(S, parsed)
registerCustom(S.customEx)

const rows = strengthProgress(S, 90)
console.log(`== ${rows.length} lifts with an estimate (of ${new Set(S.workouts.flatMap(w => w.entries.map(e => e.id))).size} trained) ==\n`)
for (const r of rows) {
  const chg = r.change == null ? 'first' : `${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}kg (${Math.round(r.pct * 100)}%)`
  console.log(
    r.name.slice(0, 30).padEnd(31),
    String(r.latest.y).padStart(6) + 'kg',
    chg.padStart(16),
    `${r.sessions} sess`.padStart(8),
    r.recentPr ? ' PR' : r.stalled ? ' stalled' : ''
  )
}
const { gained, lost } = movers(rows)
console.log('\nat best :', recentRecords(rows).length)
console.log('gained  :', gained.map(r => `${r.name} +${Math.round(r.pct*100)}%`).join(', ') || 'none')
console.log('lost    :', lost.map(r => `${r.name} ${Math.round(r.pct*100)}%`).join(', ') || 'none')
console.log('\nno estimate (expected: high-rep / bodyweight / timed):')
const withEst = new Set(rows.map(r => r.id))
const missing = [...new Set(S.workouts.flatMap(w => w.entries.map(e => e.id)))].filter(id => !withEst.has(id))
import('../src/vendor/lib/exercises.js').then(m =>
  console.log('  ' + missing.map(id => m.exOr(id).n).join('\n  ')))
