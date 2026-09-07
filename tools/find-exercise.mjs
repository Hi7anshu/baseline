import { EXDB } from '../src/vendor/lib/exercises.js'
const q = process.argv.slice(2)
for (const term of q) {
  const words = term.toLowerCase().split('+')
  const hits = EXDB.filter(e => words.every(w => e.n.includes(w)))
  console.log(`\n### ${term} (${hits.length})`)
  hits.slice(0, 10).forEach(e => console.log(`  ${e.id}  ${e.n}  [tg:${e.tg}] [eq:${e.eq}]`))
}
