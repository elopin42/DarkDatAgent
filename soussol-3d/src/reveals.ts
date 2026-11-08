// Les trois gestes d'apparition du sous-sol (concepts.md 3.4) : le balayage cathodique (titres), la boîte qui
// coulisse (blocs), le rai qui passe (images et chiffres). Écrits à la main, inspirés de .front/kit/motion/reveal.ts.
import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'

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
      gsap.fromTo(split.lines, { clipPath: 'inset(0% 0% 100% 0%)' }, {
        ...tw, scrollTrigger: { trigger: el, start: 'top 82%', once: true },
      })
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
    gsap.fromTo(els, { y: 34 }, {
      y: 0, duration: 0.42, ease: 'friction', stagger: 0.09, clearProps: 'transform',
      scrollTrigger: { trigger: parent, start: 'top 85%', once: true },
    })
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
