// « The same task, five years apart » (V2 points 14 et 15) : la vidéo de 2021 qui se joue sous un léger verre
// cathodique, quatre étapes qui s'allument au scroll le long d'un filet, et le reçu de l'agent qui s'écrit au bout.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export function mountFlow(reduced: boolean) {
  const flow = document.querySelector<HTMLElement>('[data-flow]')
  if (!flow) return
  const video = flow.querySelector<HTMLVideoElement>('[data-video]')
  if (video) {
    if (reduced) video.removeAttribute('autoplay')
    else new IntersectionObserver(([e]) => { if (e.isIntersecting) video.play().catch(() => {}); else video.pause() }, { threshold: 0.35 }).observe(video)
  }
  if (video?.dataset.quad) fitQuad(video)
  const line = flow.querySelector<SVGPathElement>('[data-flow-line]')!
  const steps = Array.from(flow.querySelectorAll<HTMLElement>('[data-flow-step]'))
  const end = flow.querySelector<HTMLElement>('[data-flow-end]')!
  line.setAttribute('pathLength', '1')
  if (reduced) { steps.forEach((s) => s.classList.add('is-on')); end.classList.add('is-on'); gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 0 }); return }
  gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 })
  let printed = false
  gsap.timeline({ scrollTrigger: { trigger: flow, start: 'top 70%', end: 'bottom 60%', scrub: 0.6,
    onUpdate: (st) => {
      steps.forEach((s, i) => s.classList.toggle('is-on', st.progress > (i + 0.5) / (steps.length + 1)))
      if (st.progress > 0.85 && !printed) { printed = true; end.classList.add('is-on'); print(end) }
    } } })
    .to(line, { strokeDashoffset: 0, ease: 'none' })
}

/** Le reçu s'écrit ligne après ligne, une fois, comme sorti de l'agent. */
function print(el: HTMLElement) {
  const rows = el.querySelectorAll<HTMLElement>('.receipt > div, .receipt__verdict, .link-ext')
  gsap.fromTo(rows, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.42, ease: 'steps(6)', stagger: 0.14, clearProps: 'clipPath' })
}

/** Cale la vidéo (640 x 400) sur le quadrilatère de l'écran du M24 de trois quarts (coins du rendu en px @2x sur
 *  1600 x 1200), par une homographie en matrix3d recalculée à la taille du conteneur. */
export function fitQuad(v: HTMLVideoElement) {
  const box = v.parentElement!
  const q = v.dataset.quad!.split(' ').map((p) => p.split(',').map(Number))
  const apply = () => {
    const k = box.clientWidth / 1600
    // un pixel de marge sous le cadre de chaque côté
    const c = [[-2, -2], [2, -2], [2, 2], [-2, 2]]
    const d = q.map(([x, y], i) => [x * k + c[i][0] * k, y * k + c[i][1] * k])
    v.style.transform = homography(640, 400, d)
  }
  apply(); addEventListener('resize', apply)
}
function homography(w: number, h: number, d: number[][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = d
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0
  const dd = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0
  // carré unité vers le quadrilatère, puis mise à l'échelle depuis w x h
  const m = [a / w, dd / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1]
  return `matrix3d(${m.map((x) => +x.toFixed(9)).join(',')})`
}
