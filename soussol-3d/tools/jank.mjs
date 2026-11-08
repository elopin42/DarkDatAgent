// Diagnostic : où tombent les images longues (même navigateur et même scroll que film.mjs, sans vidéo).
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '../../.front/tools/package.json'))
const { chromium } = require('playwright')
const url = process.argv[2]
const metal = process.env.FRONT_NAVIGATEUR === 'chromium-metal'
const b = metal ? await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] }) : await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
await p.addInitScript(() => { const f = (window.__jf = []); const tick = (t) => { f.push([t, scrollY, window.__frontReady ? 1 : 0]); requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
await p.goto(url, { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => window.__frontReady === true, null, { timeout: 20000 }).catch(() => {})
await p.waitForTimeout(1500)
const total = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight)
let y = 0; const t0 = Date.now()
while (y < total - 2 && Date.now() - t0 < 120000) { await p.mouse.wheel(0, 120); await p.waitForTimeout(200); y = await p.evaluate(() => scrollY) }
await p.waitForTimeout(2000)
const r = await p.evaluate(() => { const f = window.__jf; const out = []; for (let i = 1; i < f.length; i++) { const d = f[i][0] - f[i - 1][0]; if (d > 50) out.push(`${Math.round(f[i][0])}ms dt=${Math.round(d)} y=${Math.round(f[i][1])} ready=${f[i][2]}`) } return out })
console.log(r.join('\n'))
await b.close()
