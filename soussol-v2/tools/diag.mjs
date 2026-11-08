// Diagnostic sur le Mac : violations axe détaillées et éléments qui débordent, pour une liste d'adresses.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '../../.front/tools/package.json'))
const { chromium } = require('playwright')
const axeSrc = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const base = process.argv[2], routes = (process.argv[3] || '/').split(',')
const b = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
for (const r of routes) {
  for (const w of [1440, 375, 320]) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } })
    await p.goto(base + r, { waitUntil: 'load' }); await p.waitForTimeout(2500)
    const over = await p.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter((e) => { const x = e.getBoundingClientRect(); return x.right > W + 1 && x.width > 0 && getComputedStyle(e).position !== 'fixed' }).slice(0, 8).map((e) => `${e.tagName}.${String(e.className).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)}`) })
    console.log(`== ${r} @${w} overflow`, JSON.stringify(over))
    if (w === 1440) {
      await p.addScriptTag({ content: axeSrc })
      const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => ({ id: x.id, n: x.nodes.length, nodes: x.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.any[0]?.message || n.failureSummary || '').slice(0, 140)}`) })))
      console.log(`== ${r} axe`, JSON.stringify(v, null, 1))
    }
    await p.close()
  }
}
await b.close()
