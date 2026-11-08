// Le hero : la scène (relief de la voix), le titre en DOM dès la première image, la phrase de la voix à l'instant que
// la lumière rase, les étiquettes projetées des plaquettes et la graduation 0:00 à 7:00.
import { useEffect, useRef, useState } from 'react'
import { Canvas, advance } from '@react-three/fiber'
import * as THREE from 'three'
import { Relief, relief, LEN, xOfT, setLite } from './Relief'
import { light, pose, stepLight } from '../light'
import { onTick, gsap, ScrollTrigger, reduced, mobile } from '../clock'
import captions from '../data/captions.json'
import { STEPS, VIDEO, SITE_NAME, REPLAY_URL } from '../data/content'
import { ExtIcon } from '../ui'

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const lines = captions.lines as [number, string][]

export function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    if (!g) return false
    const ext = g.getExtension('WEBGL_debug_renderer_info')
    const name = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''
    setLite(/swiftshader|llvmpipe|software/i.test(name))
    return true
  } catch { return false }
}

export function Stage({ onReady }: { onReady: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const glRef = useRef<{ gl: THREE.WebGLRenderer; camera: THREE.Camera; size: () => { w: number; h: number } } | null>(null)
  const [webgl] = useState(() => hasWebGL() && !mobile)
  const [line, setLine] = useState(0)
  const [stepIdx, setStepIdx] = useState(-1)
  const visible = useRef(true)

  useEffect(() => {
    if (!webgl) { onReady(); return }
    const st = stageRef.current!
    const io = new IntersectionObserver(([e]) => { visible.current = e.isIntersecting; if (e.isIntersecting) light.dirty = true })
    io.observe(st)
    const t1 = ScrollTrigger.create({ trigger: st, start: 'top top', end: () => `+=${innerHeight}`, onUpdate: (s) => { light.pTarget = s.progress } })
    const prob = document.getElementById('problem')!
    const t2 = ScrollTrigger.create({ trigger: prob, start: 'top bottom', end: 'top 15%', onUpdate: (s) => { light.qTarget = s.progress } })
    light.pTarget = t1.progress; light.p = light.pTarget
    light.qTarget = t2.progress; light.q = light.qTarget

    let lastLine = -1, lastStep = -2
    const off = onTick((time, dt) => {
      stepLight(dt)
      const r = glRef.current
      if (!r || !visible.current || !light.dirty) return
      light.dirty = false
      const p = pose()
      relief.apply(p)
      advance(time * 1000)
      // la phrase de la voix à l'instant rasé
      const tNow = Math.max(0, Math.min(1, p.band)) * VIDEO.duration
      let li = 0
      for (let i = 0; i < lines.length; i++) if (lines[i][0] <= tNow + 0.01) li = i
      if (p.bandOn < 0.05 && p.band < 0) li = 0
      if (li !== lastLine) { lastLine = li; setLine(li) }
      let si = -1
      STEPS.forEach((s, i) => { if (tNow >= s.t && tNow < s.t + 14) si = i })
      if (si !== lastStep) { lastStep = si; setStepIdx(si) }
      // étiquettes projetées
      const { w, h } = r.size()
      const pr = relief.project(r.camera, w, h)
      const el = labelsRef.current
      if (el) {
        pr.steps.forEach((s, i) => {
          const n = el.children[i] as HTMLElement
          n.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y - 6 - s.r * 6).toFixed(1)}px) translate(-50%, -100%)`
          n.dataset.r = s.r > 0.5 ? '1' : '0'
          n.style.setProperty('--r', s.r.toFixed(3))
        })
        pr.ticks.forEach((t, i) => {
          const n = el.children[STEPS.length + i] as HTMLElement
          n.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translateX(-50%)`
        })
      }
      // l'angle des ombres CSS suit l'azimut de la lumière (le signe de toute l'interface)
      document.documentElement.style.setProperty('--la', `${(90 - p.azim * 0.9).toFixed(1)}deg`)
    })
    return () => { off(); io.disconnect(); t1.kill(); t2.kill() }
  }, [webgl, onReady])

  const cur = lines[line]
  const step = stepIdx >= 0 ? STEPS[stepIdx] : null

  return (
    <div className="stage" ref={stageRef}>
      <div className="stage-sticky">
        {webgl ? (
          <Canvas
            frameloop="never"
            dpr={[1, 1.5]}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
            camera={{ fov: 22, near: 1, far: 200, position: [0, 30, 20] }}
            aria-hidden="true"
            onCreated={async (state) => {
              state.gl.setClearColor('#ebeff2')
              glRef.current = { gl: state.gl, camera: state.camera, size: () => ({ w: state.size.width, h: state.size.height }) }
              await Promise.resolve()
              relief.apply(pose())
              try { await state.gl.compileAsync(state.scene, state.camera) } catch { /* compilation synchrone au premier rendu */ }
              light.dirty = true
              advance(performance.now())
              requestAnimationFrame(() => onReady())
            }}
          >
            <Relief />
          </Canvas>
        ) : (
          <img className="poster" src="/poster/relief.webp" alt="The voice of the 2021 tutorial cast in white plaster under a low raking light, with small tablets standing where the voice gives a step." />
        )}

        {webgl && (
          <div className="labels" ref={labelsRef} aria-hidden="true">
            {STEPS.map((s, i) => (
              <div key={s.t} className={`tag${s.aside ? ' aside' : ''}${i === stepIdx ? ' cur' : ''}`} data-row={s.aside ? STEPS.slice(0, i).filter((x) => x.aside).length : undefined} data-front-free>
                {s.aside && <span className="txt">{s.en}</span>}
                <span className="k">{fmt(s.t)}</span>
              </div>
            ))}
            {Array.from({ length: 8 }, (_, m) => (
              <div key={m} className="tick" data-front-free>{m}:00</div>
            ))}
          </div>
        )}

        <div className="hero-copy">
          <div className="wrap">
            <h1 className="rake engrave" data-reveal="rake">{SITE_NAME} becomes an agent.</h1>
            <p className="lede">Your training archive already holds the demonstrations agents need. We turn it into executable skills instead of asking you to record again.</p>
            <div className="hero-actions">
              <a className="btn primary" href={REPLAY_URL} rel="noopener noreferrer">Watch the run <ExtIcon /></a>
              <a className="btn stamp" href="#proof">What the database says</a>
            </div>
          </div>
        </div>

        {webgl && (
          <div className="voice wrap" aria-live="off">
            <span className="t">{fmt(cur[0])}</span>
            <div>
              <p className="fr" lang="fr" key={line}>
                {cur[1].split(' ').map((w, i) => <span key={i} style={{ animationDelay: `${i * 40}ms` }}>{w}&nbsp;</span>)}
              </p>
              <p className="en">{step ? <>Step heard at {fmt(step.t)}: <span className={step.aside ? 'green' : ''}>{step.en}</span></> : 'The voice of the 2021 tutorial, word for word, at the instant the light reaches.'}</p>
            </div>
          </div>
        )}

        <div className="scale-note wrap">
          <p className="note">The 2021 voice, 7 min 00, cast in plaster: height is loudness, measured every 40 ms. Tablets stand where the voice gives a step. <span className="green">Green: an aside said out loud, which a screen recording without the voice loses.</span></p>
          <p className="note mono">{VIDEO.by}, {VIDEO.published}, {VIDEO.license}</p>
        </div>
      </div>
    </div>
  )
}

export { LEN, xOfT, gsap, reduced }
