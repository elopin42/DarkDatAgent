// Les trois gestes d'apparition de la direction (concepts.md 5.4) : la lumière qui rase, le moulage, le sillon.
// Tous partent d'un élément déjà lisible ; aucun ne joue en reduced motion ; l'opacité n'est jamais le geste.
import { gsap, ScrollTrigger, reduced } from './clock'

const EASE = 'power2.out' // cubic-bezier(0.33, 1, 0.68, 1), un ease out cubique

/** La lumière qui rase : la bande traverse le bloc en 700 ms, l'estampage du texte passe de 0 à 1,5 px. */
export function rakeIn(el: Element, delay = 0) {
  return gsap.fromTo(el, { '--rake': -0.25, '--depth': '0px' }, { '--rake': 1.25, '--depth': '1.5px', duration: 0.7, ease: EASE, delay })
}
/** Le moulage : la profondeur se pose de 0 à 2 px avec une montée de 6 px, 600 ms. */
export function mouldIn(els: Element[] | Element, stagger = 0.09, depth = 2) {
  return gsap.fromTo(els, { y: 6, '--d': '0px' }, { y: 0, '--d': `${depth}px`, duration: 0.6, ease: EASE, stagger, clearProps: 'transform' })
}
/** Le sillon : une ligne se creuse le long de son tracé, 480 ms. */
export function grooveIn(els: Element[] | Element, stagger = 0.12) {
  return gsap.fromTo(els, { scaleX: 0 }, { scaleX: 1, duration: 0.48, ease: 'power2.inOut', stagger })
}

/** Branche les révélations déclarées par data-reveal="rake|mould|groove" (groupes : data-reveal-group). */
export function wireReveals(root: ParentNode = document) {
  if (reduced) return () => {}
  const triggers: ScrollTrigger[] = []
  const once = (el: Element, play: () => void, start = 'top 82%') => {
    triggers.push(ScrollTrigger.create({ trigger: el, start, once: true, onEnter: play }))
  }
  root.querySelectorAll('[data-reveal="rake"]').forEach((el) => {
    if (el.closest('.hero-copy')) return
    once(el, () => rakeIn(el))
  })
  root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((g) => {
    const kind = g.dataset.revealGroup
    const kids = Array.from(g.querySelectorAll(kind === 'groove' ? '.groove' : '[data-mould]'))
    if (!kids.length) return
    if (kind === 'groove') gsap.set(kids, { scaleX: 0 })
    once(g, () => (kind === 'groove' ? grooveIn(kids, 0.16) : mouldIn(kids, 0.09, Number(g.dataset.depth || 2))))
  })
  return () => triggers.forEach((t) => t.kill())
}
