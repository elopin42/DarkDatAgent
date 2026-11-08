// Les trois gestes d'apparition du sous-sol (concepts.md 3.4) : le balayage cathodique (titres), la boîte qui
// coulisse (blocs), le rai qui passe (images et chiffres). Écrits à la main, inspirés de .front/kit/motion/reveal.ts.
import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const NS = 'http://www.w3.org/2000/svg'

/** Balayage cathodique : chaque ligne se découvre de haut en bas en 4 bandes, 360 ms, 60 ms entre lignes. */
export function crtTitles(reduced: boolean) {
  if (reduced) return
  document.querySelectorAll<HTMLElement>('[data-crt]').forEach((el) => {
    const inHero = !!el.closest('#hero')
    if (inHero) return // le titre du hero est là dès la première image (porte H1), il ne se recache pas
    const split = SplitText.create(el, { type: 'lines', linesClass: 'crt-line', aria: 'none' })
    const tw = {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 0.36, ease: 'steps(4)', stagger: 0.06,
      clearProps: 'clipPath',
    }
    if (inHero) {
      gsap.fromTo(split.lines, { clipPath: 'inset(0% 0% 100% 0%)' }, { ...tw, delay: el.tagName === 'H1' ? 0.15 : 0.45 })
    } else {
      // rien ne part caché : le titre reste lisible tant qu'il n'est pas atteint (captures pleine page, sans JS),
      // et le balayage ne commence qu'au moment où il entre par le bas de l'écran
      ScrollTrigger.create({ trigger: el, start: 'top 96%', once: true, onEnter: () => gsap.fromTo(split.lines, { clipPath: 'inset(0% 0% 100% 0%)' }, tw) })
    }
  })
}

/** La boîte qui coulisse hors du rayonnage : 34 px, 420 ms, frottement, sans rebond. */
export function slideBoxes(reduced: boolean) {
  if (reduced) return
  const groups = new Map<Element, HTMLElement[]>()
  document.querySelectorAll<HTMLElement>('[data-box]').forEach((el) => {
    const p = el.parentElement!
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p)!.push(el)
  })
  groups.forEach((els, parent) => {
    ScrollTrigger.create({ trigger: parent, start: 'top 96%', once: true, onEnter: () => gsap.fromTo(els, { y: 34 }, { y: 0, duration: 0.42, ease: 'friction', stagger: 0.09, clearProps: 'transform' }) })
  })
}

/** Le rai qui passe : un balayage de lumière froide à 24 degrés, 900 ms, sur l'image de 2021 puis sur 2026. */
export function raySweeps(reduced: boolean) {
  const figs = gsap.utils.toArray<HTMLElement>('[data-ray] .ray')
  if (reduced || !figs.length) return
  const tl = gsap.timeline({ scrollTrigger: { trigger: '#pair .pair__grid', start: 'top 70%', once: true } })
  figs.forEach((f, i) => {
    tl.fromTo(f, { '--sweep': 0, '--ray-o': 1, filter: 'brightness(0.9)' }, {
      '--sweep': 1.2, filter: 'brightness(1)', duration: 0.9, ease: 'power1.inOut', clearProps: 'filter',
    }, i * 0.6)
    tl.set(f, { '--ray-o': 0 })
  })
}

/** Compteurs : 600 ms, power2.out, chiffres tabulaires à largeur fixe. Une fois. */
export function counters(reduced: boolean) {
  if (reduced) return
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count)
    const o = { v: 0 }
    gsap.to(o, {
      v: end, duration: 0.6, ease: 'power2.out', paused: false,
      onUpdate: () => (el.textContent = String(Math.round(o.v))),
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      immediateRender: false,
    })
  })
}

/** La ligne du projet sort du tableau de 34 px et y reste. */
export function usRow(reduced: boolean) {
  const row = document.querySelector<HTMLElement>('[data-us]')
  if (!row || reduced) return
  gsap.fromTo(row.children, { x: 0 }, {
    x: 34, duration: 0.42, ease: 'friction', stagger: 0.03,
    scrollTrigger: { trigger: row, start: 'top 75%', once: true },
  })
}

/** Les 24 boîtes de [PROBLEM] : leurs étiquettes passent de l'ambre au gris une à une au scroll, ce qui dort. */
export function buildSleepers(reduced: boolean) {
  if (rowBoxes(reduced)) return
  const svg = document.querySelector<SVGSVGElement>('[data-sleepers]')
  if (!svg) return
  const n = 24, w = 40, gap = 9.5, h = 128
  const labels: SVGRectElement[] = []
  const x0 = (1200 - (n * w + (n - 1) * gap)) / 2
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (w + gap)
    const g = document.createElementNS(NS, 'g')
    const box = document.createElementNS(NS, 'rect')
    box.setAttribute('class', 's-box'); box.setAttribute('x', String(x)); box.setAttribute('y', String(150 - 10 - h + (i % 5 === 2 ? 8 : 0)))
    box.setAttribute('width', String(w)); box.setAttribute('height', String(h - (i % 5 === 2 ? 8 : 0)))
    const hole = document.createElementNS(NS, 'circle')
    hole.setAttribute('class', 's-hole'); hole.setAttribute('cx', String(x + w / 2)); hole.setAttribute('cy', String(150 - 10 - h + 22)); hole.setAttribute('r', '6')
    const label = document.createElementNS(NS, 'rect')
    label.setAttribute('class', 's-label'); label.setAttribute('x', String(x + 6)); label.setAttribute('y', String(150 - 10 - h + 44))
    label.setAttribute('width', String(w - 12)); label.setAttribute('height', '46')
    g.append(box, hole, label); svg.append(g); labels.push(label)
  }
  const shelf = document.createElementNS(NS, 'rect')
  shelf.setAttribute('class', 's-shelf'); shelf.setAttribute('x', '0'); shelf.setAttribute('y', '140'); shelf.setAttribute('width', '1200'); shelf.setAttribute('height', '6')
  svg.append(shelf)

  const amber = getComputedStyle(document.documentElement).getPropertyValue('--amber').trim()
  const grey = getComputedStyle(document.documentElement).getPropertyValue('--rule').trim()
  if (reduced) { labels.forEach((l) => (l.style.fill = grey)); return }
  let last = -1
  gsap.timeline({
    scrollTrigger: {
      trigger: svg, start: 'top 85%', end: '+=' + Math.round(innerHeight * 0.72), scrub: true,
      onUpdate: (st) => {
        const k = Math.round(st.progress * n)
        if (k === last) return
        last = k
        labels.forEach((l, i) => (l.style.fill = i < k ? grey : amber))
      },
    },
  })
}

// v2 (point 5) : la rangée rendue sous Blender. L'image grise recouvre l'ambre colonne par colonne (bords droits des
// 24 boîtes, MANIFEST des rendus), une boîte par cran de scroll : ce qui dort s'éteint.
const ROW_RIGHT = [145.6, 248.4, 351.3, 454.2, 557.0, 659.9, 762.8, 865.6, 968.5, 1071.4, 1174.2, 1277.1, 1380.0, 1482.8, 1585.7, 1688.6, 1791.4, 1894.3, 1997.1, 2100.0, 2202.9, 2305.7, 2408.6, 2511.5]
function rowBoxes(reduced: boolean) {
  const row = document.querySelector<HTMLElement>('[data-row]')
  if (!row) return false
  const grey = row.querySelector<HTMLElement>('[data-row-grey]')!
  const set = (k: number) => { grey.style.clipPath = k <= 0 ? 'inset(0 100% 0 0)' : `inset(0 ${100 - (ROW_RIGHT[Math.min(23, k - 1)] + 1.5) / 25.6}% 0 0)` }
  if (reduced) { set(24); return true }
  let last = -1
  gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 85%', end: '+=' + Math.round(innerHeight * 0.72), scrub: true,
    onUpdate: (st) => { const k = Math.round(st.progress * 24); if (k !== last) { last = k; set(k) } } } })
  return true
}
