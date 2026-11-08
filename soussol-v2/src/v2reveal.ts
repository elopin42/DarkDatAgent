// Gestes v2, sobres : le surligneur qui se trace, le filet ambre des services, les affirmations qui coulissent.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { playStrip } from './boxes'

export function v2Reveals(reduced: boolean) {
  // 8. Upkeep : la boîte de la réparation se reclasse ; sa feuille garde « not run yet » (aucune réparation n'a tourné ce week-end)
  document.querySelectorAll<HTMLElement>('[data-refile]').forEach((b) => {
    const sheet = b.querySelector<HTMLElement>('[data-rev]')!
    if (reduced) return
    ScrollTrigger.create({ trigger: b, start: 'top 80%', once: true, onEnter: () => {
      playStrip(b, 'done', 0.7, () => { gsap.fromTo(sheet, { clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)', duration: 0.36, ease: 'steps(4)' }) })
    } })
  })
  if (reduced) return
  const vh = innerHeight
  document.querySelectorAll<HTMLElement>('mark.hl').forEach((m) => {
    if (m.closest('#hero')) return
    if (m.getBoundingClientRect().top < vh * 0.9) return // déjà à l'écran : on ne le retire pas
    ScrollTrigger.create({ trigger: m, start: 'top 92%', once: true, onEnter: () => gsap.fromTo(m, { '--hl-w': '0%' }, { '--hl-w': '100%', duration: 0.7, ease: 'power2.out', delay: 0.25 }) })
  })
  const tools = gsap.utils.toArray<HTMLElement>('[data-tool]')
  if (tools.length) {
    ScrollTrigger.create({ trigger: tools[0].parentElement, start: 'top 80%', once: true, onEnter: () => {
      const tl = gsap.timeline()
      tools.forEach((t, i) => {
        tl.fromTo(t, { '--rule-k': 0 }, { '--rule-k': 1, duration: 0.9, ease: 'power2.inOut' }, i * 0.18)
        tl.fromTo(t.querySelector('.tool__name'), { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.36, ease: 'steps(4)', clearProps: 'clipPath' }, i * 0.18 + 0.3)
        tl.fromTo(t.querySelector('.tool__why'), { y: 16 }, { y: 0, duration: 0.42, ease: 'friction', clearProps: 'transform' }, i * 0.18 + 0.4)
      })
    } })
  }
  // second geste, réservé aux boîtes et aux résultats (tiré de l'archive) :
  // les boîtes se posent sur l'étagère, une à une ; les résultats passent sous le faisceau de la lampe
  document.querySelectorAll<HTMLElement>('.rack').forEach((rack) => {
    const imgs = rack.querySelectorAll<HTMLElement>('.box__img')
    if (!imgs.length) return
    ScrollTrigger.create({ trigger: rack, start: 'top 92%', once: true, onEnter: () => gsap.fromTo(imgs, { y: -22 }, { y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.06, clearProps: 'transform' }) })
  })
  // les résultats sortent comme une fiche qui s'imprime (de gauche à droite, sans éclat), une fois
  document.querySelectorAll<HTMLElement>('[data-lamp]').forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 92%', once: true, onEnter: () => gsap.fromTo(el, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power2.out', clearProps: 'clipPath' }) })
  })
  const claims = gsap.utils.toArray<HTMLElement>('[data-claim]')
  if (claims.length) {
    gsap.fromTo(claims, { x: -34 }, { x: 0, duration: 0.42, ease: 'friction', stagger: 0.12, clearProps: 'transform', scrollTrigger: { trigger: claims[0], start: 'top 80%', once: true } })
  }
}
