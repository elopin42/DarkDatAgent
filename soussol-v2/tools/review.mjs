// Revue en direct (V2 point 29) : chaque page du build, à 1440, 768 et 375, parcourue écran par écran comme un
// visiteur (molette), avec une capture par écran et une détection automatique : texte coupé (débordement caché),
// débordement horizontal de la page, textes qui se chevauchent, éléments qui sortent de leur bloc.
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '../../.front/tools/package.json'))
const { chromium } = require('playwright')
const base = process.argv[2], label = process.argv[3] || 'v2r2-review'
const routes = (process.argv[4] || '/,/board/?step=7,/pipeline/,/storyboard/,/skills/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/').split(',')
const out = join(HERE, '../../design/checks', label); mkdirSync(out, { recursive: true })
const b = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
const report = []
const DETECT = () => {
  const W = document.documentElement.clientWidth, H = innerHeight
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && cs.visibility !== 'hidden' && +cs.opacity > 0.05 }
  const name = (e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
  const txt = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)
  const found = []
  const all = [...document.querySelectorAll('body *')].filter((e) => !e.closest('[aria-hidden="true"], canvas, svg, .sr-only, script, style') && vis(e))
  for (const e of all) {
    const cs = getComputedStyle(e)
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    // texte coupé : contenu plus large ou plus haut que la boîte, alors que le débordement est caché
    if (own && (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 3)) found.push(`coupé: ${name(e)} "${txt(e)}" ${e.scrollWidth}x${e.scrollHeight} > ${e.clientWidth}x${e.clientHeight}`)
    // sort de l'écran à droite
    const r = e.getBoundingClientRect()
    if (own && r.right > W + 1 && !e.closest('.table-scroll, .tl__viewport')) found.push(`hors écran: ${name(e)} "${txt(e)}" right=${Math.round(r.right)} > ${W}`)
    // sort de son parent porteur (débordement visible) : texte plus large que le bloc qui le contient
    const p = e.parentElement
    if (own && p && !e.closest('.table-scroll, .tl__viewport') && cs.position !== 'absolute' && cs.position !== 'fixed') {
      const pr = p.getBoundingClientRect(); const pcs = getComputedStyle(p)
      if (pcs.overflow === 'visible' && r.right > pr.right + 3 && pr.width > 40 && e.scrollWidth > pr.width) found.push(`déborde du bloc: ${name(e)} "${txt(e)}" dans ${name(p)} (${Math.round(r.right - pr.right)} px)`)
    }
  }
  // chevauchements entre feuilles de texte (pas parent et enfant)
  const leaves = all.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest('.tl__viewport .tl__ev:not(.is-on)'))
  // une collision réelle : deux lignes de texte (rectangles de ligne, pas la boîte englobante d'un élément en ligne sur
  // plusieurs lignes) qui se recouvrent, hors en-tête fixe et hors scène du hero qui recouvre la page par construction
  const covered = (e) => e.closest('.nav, #hero')
  const rects = leaves.filter((e) => !covered(e)).map((e) => [e, [...e.getClientRects()]])
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const [a, la] = rects[i], [c, lc] = rects[j]
    if (a.contains(c) || c.contains(a)) continue
    let hit = false
    for (const ra of la) { for (const rc of lc) {
      const ix = Math.min(ra.right, rc.right) - Math.max(ra.left, rc.left), iy = Math.min(ra.bottom, rc.bottom) - Math.max(ra.top, rc.top)
      if (ix > 4 && iy > 4) { const top = document.elementFromPoint((Math.max(ra.left, rc.left) + Math.min(ra.right, rc.right)) / 2, (Math.max(ra.top, rc.top) + Math.min(ra.bottom, rc.bottom)) / 2); if (top && (a.contains(top) || c.contains(top) || top.contains(a) || top.contains(c))) hit = true }
    } }
    if (hit) found.push(`chevauche: ${name(a)} "${txt(a)}" et ${name(c)} "${txt(c)}"`)
  }
  if (document.documentElement.scrollWidth > W + 1) found.push(`page plus large que l'écran: ${document.documentElement.scrollWidth} > ${W}`)
  return found
}
for (const w of [1440, 768, 375]) {
  const h = w === 375 ? 812 : w === 768 ? 1024 : 900
  for (const r of routes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    const p = await ctx.newPage()
    await p.goto(base + r, { waitUntil: 'load', timeout: 60000 })
    await p.waitForFunction(() => window.__frontReady === true, null, { timeout: 20000 }).catch(() => {})
    await p.waitForTimeout(1200)
    const slug = (r === '/' ? 'home' : r.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')).slice(0, 40)
    const total = await p.evaluate(() => document.documentElement.scrollHeight)
    const issues = new Set()
    let k = 0
    for (let y = 0; y < total && k < 40; y += Math.round(h * 0.8), k++) {
      const cur = await p.evaluate(() => scrollY)
      await p.mouse.move(w / 2, h / 2); await p.mouse.wheel(0, y - cur); await p.waitForTimeout(900)
      for (const f of await p.evaluate(DETECT)) issues.add(f)
      await p.screenshot({ path: join(out, `${slug}-${w}-${String(k).padStart(2, '0')}.png`) })
    }
    report.push({ route: r, width: w, screens: k, issues: [...issues] })
    console.log(`${r} @${w} : ${k} écrans, ${issues.size} constat(s)`)
    for (const i of [...issues].slice(0, 25)) console.log('   ' + i)
    await ctx.close()
  }
}
writeFileSync(join(out, 'review.json'), JSON.stringify(report, null, 1))
await b.close()
