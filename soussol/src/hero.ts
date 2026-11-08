// Le hero : la pièce, l'écran vivant du M24, et le scroll. Travelling avant de 0 à 70 % du pin, puis traversée du
// verre de 70 à 100 % (concepts.md 3.8). Rendu à la demande dans le ticker GSAP.
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { EffectComposer, RenderPass, EffectPass, NoiseEffect, ToneMappingEffect, ToneMappingMode, BlendFunction } from 'postprocessing'
import { gsap } from 'gsap'
import { C } from './palette'
import { buildRoom, SCREEN } from './room'
import { M24Screen } from './screen'

type Opts = { reduced: boolean; mobile: boolean; frozenT: number | null }

const CAM_A = new THREE.Vector3(0, 1.35, 3.6)
const CAM_B = new THREE.Vector3(0, 1.12, 1.15)
const LOOK_A = new THREE.Vector3(-0.25, 0.98, 0)
const CAM_C = new THREE.Vector3(0, SCREEN.y, SCREEN.z + 0.04)

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export async function mountHero(canvas: HTMLCanvasElement, opts: Opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false })
  renderer.setPixelRatio(opts.mobile ? 1 : Math.min(devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  RectAreaLightUniformsLib.init()
  // rendu logiciel (SwiftShader, llvmpipe) : on garde l'image juste mais on espace les rendus pour laisser vivre la page
  const gl = renderer.getContext()
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
  const software = /swiftshader|llvmpipe|software/i.test(gpuName)
  const minGap = software ? 1200 : 0 // ms entre la fin d'un rendu et le suivant

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(C.cellar)
  scene.fog = new THREE.FogExp2(C.cellar, 0.11)
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 40)
  await nextFrame()
  await buildRoom(scene)
  await nextFrame()

  // l'écran vivant : un seul maillage courbé par la géométrie, puis le verre en seconde passe
  const screen = new M24Screen(document.querySelector('[data-screen-text]'))
  await screen.load(6)
  await nextFrame()
  const tex = new THREE.CanvasTexture(screen.canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.anisotropy = 4
  const sGeo = new THREE.PlaneGeometry(0.272, 0.17, 32, 20)
  const pos = sGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 0.136, y = pos.getY(i) / 0.085
    pos.setZ(i, 0.007 * (1 - 0.5 * x * x - 0.5 * y * y))
  }
  const sMesh = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({ map: tex, fog: false, color: new THREE.Color(1.7, 1.7, 1.7) }))
  sMesh.position.set(0, SCREEN.y, SCREEN.z - 0.001)
  scene.add(sMesh)
  const gc = document.createElement('canvas'); gc.width = 128; gc.height = 80
  {
    const x = gc.getContext('2d')!
    const g = x.createRadialGradient(30, 14, 2, 30, 14, 90); g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g; x.fillRect(0, 0, 128, 80)
  }
  const gTex = new THREE.CanvasTexture(gc); gTex.colorSpace = THREE.SRGBColorSpace
  const glass = new THREE.Mesh(sGeo, new THREE.MeshBasicMaterial({
    map: gTex, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, fog: false,
  }))
  glass.position.set(0, SCREEN.y, SCREEN.z + 0.0005)
  scene.add(glass)

  // composeur : rendu, grain fin d'émulsion, ACES
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: opts.mobile || software ? 0 : 4 })
  composer.addPass(new RenderPass(scene, camera))
  const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN })
  noise.blendMode.opacity.value = 0.14
  const effectPass = new EffectPass(camera, noise, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }))
  composer.addPass(effectPass)

  let dirty = true
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setSize(w, h, false); composer.setSize(w, h, false)
    camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true
  }
  addEventListener('resize', resize)
  resize()

  const amber = document.querySelector<HTMLElement>('[data-amber]')!
  const stage = document.querySelector<HTMLElement>('[data-hero-stage]')!
  const copy = document.querySelector<HTMLElement>('[data-hero-copy]')!
  const caption = document.querySelector<HTMLElement>('[data-hero-caption]')!
  const state = { p: opts.reduced ? 0.7 : 0 }
  let lastP = -1

  if (!opts.reduced && !opts.mobile) {
    gsap.to(state, {
      p: 1, ease: 'none',
      scrollTrigger: { trigger: '#hero', start: 'top top', end: '+=100%', pin: true, pinSpacing: false, scrub: 0.6 },
    })
  }

  const t0 = performance.now()
  const clockNow = () => (opts.frozenT !== null ? opts.frozenT / 1000 : (performance.now() - t0) / 1000)
  const look = new THREE.Vector3()
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  const cubicOut = (t: number) => 1 - Math.pow(1 - t, 3)

  if (opts.mobile) { CAM_A.set(0, 1.75, 3.4); LOOK_A.set(0, 0.3, 0) } // écran étroit : le poste en haut, le texte en bas
  function applyProgress(p: number) {
    const a = smooth(0, 0.7, p)
    camera.position.lerpVectors(CAM_A, CAM_B, a)
    look.lerpVectors(LOOK_A, SCREEN, a)
    const g = smooth(0.7, 0.82, p)
    if (g > 0) { camera.position.lerp(CAM_C, cubicOut(g)); look.copy(SCREEN) }
    camera.fov = 38 - 14 * g
    camera.updateProjectionMatrix()
    camera.lookAt(look)
    amber.style.opacity = String(smooth(0.8, 0.87, p))
    // l'iris perce la scène : derrière, la section suivante est déjà là, sur le gris clair du boîtier
    const r = smooth(0.87, 0.97, p)
    const R = cubicOut(r) * 120
    stage.style.maskImage = stage.style.webkitMaskImage = r > 0 ? `radial-gradient(circle at 50% 50%, transparent ${R}vmax, #000 ${R + 0.4}vmax)` : ''
    stage.style.visibility = p >= 0.975 ? 'hidden' : 'visible'
    const c = smooth(0.12, 0.42, p)
    copy.style.clipPath = c > 0 ? `inset(0 0 ${c * 100}% 0)` : ''
    copy.style.transform = c > 0 ? `translateY(${-c * 40}px)` : ''
    caption.style.clipPath = c > 0 ? `inset(0 0 ${c * 100}% 0)` : ''
    screen.setMode(p > 0.22 ? 'skill' : 'read', clockNow())
    screen.setSkill((p - 0.22) / (0.62 - 0.22))
  }

  if (opts.reduced) { screen.setMode('skill', 0); screen.setSkill(1) }
  applyProgress(state.p)
  screen.update(clockNow()); tex.needsUpdate = true
  renderer.shadowMap.needsUpdate = true
  await renderer.compileAsync(scene, camera)
  await nextFrame()
  // le matériau plein écran du composeur se compile aussi à l'avance, pour ne pas bloquer la première image
  const warm = new THREE.Scene()
  warm.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), effectPass.fullscreenMaterial))
  await renderer.compileAsync(warm, camera).catch(() => {})
  await nextFrame()
  { // passe d'ombre et premier rendu dans une cible hors écran, rien ne s'affiche avant le composeur
    const rt = new THREE.WebGLRenderTarget(64, 64)
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); rt.dispose()
  }
  await nextFrame()
  renderer.initTexture(tex)
  composer.render()

  let visible = true
  new IntersectionObserver(([e]) => { visible = e.isIntersecting }).observe(canvas)
  document.addEventListener('visibilitychange', () => { dirty = true })
  ;(window as unknown as { __scene: unknown }).__scene = { renderer }

  let lastRender = 0
  let lastScreen = 0
  return {
    frame() {
      if (!visible || document.hidden) return
      if (state.p !== lastP) { lastP = state.p; applyProgress(state.p); dirty = true }
      if (state.p >= 0.985) return // la page claire a pris la main, le canvas ne rend plus
      const now = performance.now()
      if (now - lastRender < minGap) return
      // l'écran se redessine au plus à 25 i/s (le phosphore n'a pas besoin de plus), et seulement avant un rendu
      if (now - lastScreen >= 40 && screen.update(clockNow())) { tex.needsUpdate = true; dirty = true; lastScreen = now }
      if (dirty) { composer.render(); dirty = false; lastRender = performance.now() }
    },
  }
}
