// Diagnostic INP sur le Mac, même méthode que check.mjs (390 x 844, tactile, CPU x4, 4G), plusieurs routes.
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../.front/tools/package.json'))
const { chromium } = require('playwright')
const b = await chromium.launch({ args: ['--use-angle=metal'] })
for (const r of process.argv[3].split(',')) {
  for (const variant of (process.argv[4] || '').split(',')) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.addInitScript(() => { window.__p = { inp: 0, ev: [] }; new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__p.inp = Math.max(window.__p.inp, e.duration); window.__p.ev.push(`${e.name}:${Math.round(e.duration)} proc ${Math.round(e.processingEnd - e.processingStart)} delay ${Math.round(e.processingStart - e.startTime)}`) } }).observe({ type: 'event', buffered: true, durationThreshold: 16 }) })
    await page.goto(process.argv[2] + r + (variant ? (r.includes('?') ? '&' : '?') + variant : ''), { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(3000)
    const btn = await page.$('main button, button'); const label = btn ? await btn.evaluate((e) => e.textContent.trim().slice(0, 20)) : ''
    if (btn) { await btn.tap().catch(() => {}); await page.waitForTimeout(600) }
    const p = await page.evaluate(() => window.__p)
    console.log(r, variant || '-', `"${label}"`, Math.round(p.inp), p.ev.slice(0, 6).join(' | '))
    await ctx.close()
  }
}
await b.close()
