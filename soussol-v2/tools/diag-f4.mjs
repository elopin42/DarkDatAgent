// Diagnostic F4 sur le Mac : les éléments texte dont le bord gauche est unique (orphelins), trois premiers écrans.
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../.front/tools/package.json'))
const { chromium } = require('playwright')
const b = await chromium.launch({ args: ['--use-angle=metal'] })
for (const r of process.argv[3].split(',')) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await p.goto(process.argv[2] + r, { waitUntil: 'load' }); await p.waitForTimeout(2500)
  const o = await p.evaluate(() => {
    const vis = (e) => { const x = e.getBoundingClientRect(); const cs = getComputedStyle(e); return x.width > 0 && x.height > 0 && x.top < innerHeight * 3 && cs.visibility !== 'hidden' && +cs.opacity > 0.05 }
    const t = [...document.querySelectorAll('body *')].filter((e) => !['SCRIPT', 'STYLE'].includes(e.tagName) && vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest('[data-front-free]'))
    const m = new Map(); for (const e of t) { const x = Math.round(e.getBoundingClientRect().left / 2) * 2; (m.get(x) || m.set(x, []).get(x)).push(e) }
    return [...m.entries()].filter(([, a]) => a.length === 1).map(([x, a]) => `${x} ${a[0].tagName}.${String(a[0].className).slice(0, 30)} "${a[0].textContent.trim().slice(0, 40)}"`)
  })
  console.log('==', r); console.log(o.join('\n'))
  await p.close()
}
await b.close()
