// Les mots réels de la voix (sous-titres automatiques YouTube, français d'origine) avec leur instant.
import { readFileSync, writeFileSync } from 'node:fs'
const [, , input, output] = process.argv
const d = JSON.parse(readFileSync(input, 'utf8'))
const lines = []
for (const e of d.events) {
  if (!e.segs) continue
  const t = e.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim()
  if (t) lines.push([Math.round(e.tStartMs / 100) / 10, t])
}
writeFileSync(output, JSON.stringify({ source: 'YouTube automatic captions (fr-orig) of JZMgB1UItkk', lines }))
console.log(lines.length)
