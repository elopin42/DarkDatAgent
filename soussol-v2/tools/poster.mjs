// L'affiche de repli (et de l'arrivée de la scène, point 23) : la scène seule, sans aucun texte de la page.
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '../../.front/tools/package.json'))
const { chromium } = require('playwright')
const b = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
await p.goto(process.argv[2] + '/?t=9000', { waitUntil: 'load' })
await p.waitForFunction(() => window.__frontReady === true, null, { timeout: 60000 })
await p.addStyleTag({ content: '.nav,.hero__copy,.hero__caption,.hero__hint,.hero__poster{display:none!important} .hero__canvas{opacity:1!important}' })
await p.waitForTimeout(3000)
const out = join(HERE, '../public/poster')
await p.screenshot({ path: join(HERE, 'poster-capture.png'), clip: { x: 0, y: 0, width: 1600, height: 1000 } }) // converti en WebP sur la station
void out; void execSync
console.log('affiche écrite')
await b.close()
