// La frise moulée (concepts.md 5.6) : neuf plaquettes de plâtre reliées par un sillon. En cours : la bande de lumière
// se pose sur la plaquette. Terminé : la plaquette se moule (montée 6 px, ombre 0 à 14 px, 600 ms), sa sortie s'inscrit,
// le sillon se creuse jusqu'à la suivante (480 ms). Rejeu du run du 7 novembre, pilotable au clavier.
import { useEffect, useRef, useState } from 'react'
import { gsap, ScrollTrigger, reduced, frozenT } from '../clock'
import { CHAIN, RUN } from '../data/content'

const WORK = 1.1, MOULD = 0.6, GROOVE = 0.48
const SLOT = WORK + MOULD + 0.2

export function Frise() {
  const root = useRef<HTMLDivElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const busy = useRef(false)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [said, setSaid] = useState('')

  useEffect(() => {
    const el = root.current!
    const plaqs = Array.from(el.querySelectorAll<HTMLElement>('.plaq'))
    const segs = Array.from(el.querySelectorAll<SVGPathElement>('path.seg'))
    const tl = gsap.timeline({ paused: true, onComplete: () => setPlaying(false) })
    gsap.set(segs, { drawSVG: '0%' })
    plaqs.forEach((p, i) => {
      const at = i * SLOT
      tl.addLabel(`l${i}`, at)
      tl.call(() => setCur(i), undefined, at)
      tl.set(p, { attr: { 'data-state': 'work' } }, at)
      tl.fromTo(p, { '--band': 0 }, { '--band': 1, duration: WORK, ease: 'none' }, at)
      tl.set(p, { attr: { 'data-state': 'done' }, '--band': 0 }, at + WORK)
      tl.fromTo(p, { y: 0, '--d': '0px' }, { y: -6, '--d': '14px', duration: MOULD, ease: 'power2.out', immediateRender: false }, at + WORK)
      tl.call(() => setSaid(`${CHAIN[i].verb} done: ${CHAIN[i].out}`), undefined, at + WORK + MOULD)
      if (segs[i]) tl.fromTo(segs[i], { drawSVG: '0%' }, { drawSVG: '100%', duration: GROOVE, ease: 'power2.inOut', immediateRender: false }, at + WORK + 0.1)
    })
    tlRef.current = tl
    if (reduced) { tl.progress(1); setCur(CHAIN.length - 1) }
    else if (frozenT !== null) { tl.seek(frozenT / 1000); }
    const st = reduced || frozenT !== null ? null : ScrollTrigger.create({ trigger: el, start: 'top 62%', once: true, onEnter: () => { tl.play(); setPlaying(true) } })
    return () => { st?.kill(); tl.kill() }
  }, [])

  // verrou anti double clic : un pas au plus toutes les 600 ms
  const guard = (fn: () => void) => { if (busy.current) return; busy.current = true; fn(); setTimeout(() => { busy.current = false }, 600) }
  const go = (i: number) => guard(() => {
    const tl = tlRef.current!; const n = Math.max(0, Math.min(CHAIN.length - 1, i))
    tl.pause(); setPlaying(false)
    tl.seek(n * SLOT + WORK + MOULD + 0.01); setCur(n)
  })
  const toggle = () => guard(() => { const tl = tlRef.current!; if (tl.isActive()) { tl.pause(); setPlaying(false) } else { if (tl.progress() === 1) tl.restart(); else tl.play(); setPlaying(true) } })
  const replay = () => guard(() => { const tl = tlRef.current!; tl.restart(); setPlaying(true) })

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1) }
    else if (e.key === ' ') { e.preventDefault(); toggle() }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); replay() }
  }

  const link = CHAIN[cur]
  return (
    <div className="frise-block" ref={root} onKeyDown={onKey}>
      <div className="frise stamp stamp-1">
        <div className="frise-row" role="list" aria-label="The nine links of the chain">
          {CHAIN.map((c, i) => (
            <button key={c.n} className="plaq" role="listitem" data-state="todo" aria-current={i === cur ? 'true' : undefined} onClick={() => go(i)}>
              <span className="n">{String(c.n).padStart(2, '0')}</span>
              <span className="verb">{c.verb}</span>
              <span className={`who${c.tool ? ' tool' : ''}`}>{c.who}</span>
              <span className="out">{c.out}</span>
            </button>
          ))}
        </div>
        <svg className="sillon" viewBox="0 0 900 8" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="4" x2="850" y2="4" stroke="var(--shadow)" strokeOpacity="0.35" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {CHAIN.slice(0, -1).map((_, i) => (
            <g key={i}>
              <path className="seg" d={`M${i * 100 + 50} 5 H${i * 100 + 150}`} stroke="var(--hi)" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
              <path className="seg" d={`M${i * 100 + 50} 4 H${i * 100 + 150}`} stroke="var(--mute)" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
      </div>

      <div className="desk">
        <div className="reading stamp stamp-1">
          <div className="head">
            <h3><span className="label">{String(link.n).padStart(2, '0')}</span> {link.verb}, <span className="mono" style={{ fontSize: 'var(--s20)' }}>{link.who}</span></h3>
            <span className="label">Replay, 7 Nov 2026</span>
          </div>
          <div className="io">
            <div><b>In</b><p>{link.inp}</p></div>
            <div><b>Out</b><p>{link.out}</p></div>
          </div>
          <p className="note" style={{ marginTop: 16 }}>For the technical reader: {link.tech}.</p>
        </div>
        <div className="controls stamp stamp-1">
          <p className="label">Run {RUN.id}, invoice {RUN.row}, skill revision {RUN.revision}. Pace compressed, the real run took {RUN.duration} s.</p>
          <div className="row">
            <button className="btn stamp" onClick={() => go(cur - 1)} aria-label="Previous link">Back</button>
            <button className="btn primary" onClick={toggle}>{playing ? 'Pause' : 'Play the run'}</button>
            <button className="btn stamp" onClick={() => go(cur + 1)} aria-label="Next link">Next</button>
          </div>
          <button className="btn stamp" onClick={replay}>Replay from Fetch</button>
          <p className="note">Keys: left and right arrows, space, R.</p>
        </div>
      </div>
      <p className="sr" aria-live="polite">{said}</p>
    </div>
  )
}
