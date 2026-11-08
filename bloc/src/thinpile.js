// Footer: the skill as a thin pile of 60 plates, drawn with a pen, one line per keyframe Holo4 read.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { reduced } from './motion.js'

const NS = 'http://www.w3.org/2000/svg'

export function drawThinPile(g) {
  if (!g) return
  const n = 60
  const lines = []
  for (let i = 0; i < n; i++) {
    const y = 196 - i * 2.6
    const x = 30 + i * 0.9
    // one plate seen from three quarters: the front edge and the side edge
    const p = document.createElementNS(NS, 'polyline')
    p.setAttribute('points', `${x},${y} ${x + 150},${y} ${x + 200},${y - 26}`)
    p.setAttribute('fill', 'none')
    p.setAttribute('stroke', i % 5 === 4 ? '#034649' : '#11161f')
    p.setAttribute('stroke-width', i % 5 === 4 ? '1.2' : '0.7')
    g.appendChild(p)
    lines.push(p)
  }
  // top plate outline
  const top = document.createElementNS(NS, 'polygon')
  const yt = 196 - (n - 1) * 2.6, xt = 30 + (n - 1) * 0.9
  top.setAttribute('points', `${xt},${yt} ${xt + 150},${yt} ${xt + 200},${yt - 26} ${xt + 50},${yt - 26}`)
  top.setAttribute('fill', '#f5f7f9')
  top.setAttribute('stroke', '#11161f')
  top.setAttribute('stroke-width', '1')
  g.appendChild(top)
  if (reduced()) return
  const tl = gsap.timeline({ paused: true })
  lines.forEach((p, i) => {
    const len = p.getTotalLength()
    tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, i * 0.025)
  })
  tl.fromTo(top, { y: -14, scale: 1.02, transformOrigin: '50% 50%' }, { y: 0, scale: 1, duration: 0.52, ease: 'power3.out' }, '-=0.2')
  ScrollTrigger.create({ trigger: g.closest('figure'), start: 'top 80%', once: true, onEnter: () => tl.play() })
}
