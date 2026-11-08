// The block (design/concepts.md 4.1, 4.4, 4.8): the 2021 video as 106 plexiglas plates, one per real keyframe,
// stacked in time order. Scroll turns it a quarter and fans it out (problem), then the 60 frames the pipeline sends to
// Holo4 leave the block five at a time and settle on a thin pile, the skill. Rendered only when something moves.
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { FRAMES } from './data/frames.js'
import { spring } from './motion.js'

const N = FRAMES.length            // 106
const READ = FRAMES.filter((f) => f.read) // 60
const M = READ.length
const W = 1.6, H = 1.0, T = 0.02
const P0 = 0.026, P1 = 0.052       // pitch: plate + 2 mm gap at scale, then fanned out
const PILE_P0 = 0.024, PILE_P1 = 0.015
const HD_BLOCK = 0, HD_PILE = FRAMES.indexOf(READ[M - 1])

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x) => x * x * (3 - 2 * x)
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const outCubic = (x) => 1 - Math.pow(1 - x, 3)
const lerp = (a, b, t) => a + (b - a) * t
const seg = (u, a, b) => clamp((u - a) / (b - a))

const vert = /* glsl */`
attribute float aIdx;
attribute float aEdge;
attribute float aHi;
varying vec2 vUv;
varying vec3 vNo;
varying vec3 vN;
varying vec3 vV;
varying float vIdx;
varying float vEdge;
varying float vHi;
void main() {
  vUv = uv;
  vNo = normal;
  vIdx = aIdx; vEdge = aEdge; vHi = aHi;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const frag = /* glsl */`
uniform sampler2D uAtlas;
uniform sampler2D uHdA;
uniform sampler2D uHdB;
uniform float uHdAIdx;
uniform float uHdBIdx;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vNo;
varying vec3 vN;
varying vec3 vV;
varying float vIdx;
varying float vEdge;
varying float vHi;
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// a soft studio box above and to the left, seen in the reflection
float softbox(vec3 r) {
  return smoothstep(0.25, 0.75, r.y) * (1.0 - smoothstep(0.35, 0.95, abs(r.x + 0.25)));
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 4.0);
  vec3 R = reflect(-V, N);
  vec3 col;
  float alpha;
  if (abs(vNo.z) > 0.5) {
    // the printed face
    vec2 cr = vec2(mod(vIdx, 10.0), floor(vIdx / 10.0));
    vec2 inset = vec2(4.5 / 256.0, 3.5 / 160.0);
    vec2 uvc = inset + vUv * (1.0 - 2.0 * inset);
    vec2 auv = vec2((cr.x + uvc.x) / 10.0, 1.0 - (cr.y + 1.0 - uvc.y) / 11.0);
    vec3 img = texture2D(uAtlas, auv).rgb;
    if (abs(vIdx - uHdAIdx) < 0.5) img = texture2D(uHdA, vUv).rgb;
    if (abs(vIdx - uHdBIdx) < 0.5) img = texture2D(uHdB, vUv).rgb;
    col = img;
    // polished bevel just inside the plate edge
    vec2 e = min(vUv, 1.0 - vUv);
    float bevel = 1.0 - smoothstep(0.0, 0.012, min(e.x * 1.6, e.y));
    col = mix(col, lin(vec3(0.93, 0.97, 0.98)), bevel * 0.55);
    col += softbox(R) * 0.16 + fres * 0.35;
    col = mix(col, lin(vec3(0.0, 0.36, 0.8)), vHi * 0.18);
    alpha = uOpacity + fres * 0.1;
  } else {
    // the edge of the plate: brighter than the face, as acrylic carries light to its edges
    float lit = 0.72 + 0.28 * max(N.y, 0.0) + 0.12 * max(-N.x, 0.0);
    vec3 edge = mix(lin(vec3(0.80, 0.87, 0.88)), lin(vec3(0.95, 0.99, 0.99)), vEdge);
    col = edge * lit + softbox(R) * 0.2;
    col = mix(col, lin(vec3(0.0, 0.36, 0.8)), vHi * 0.75);
    alpha = 0.96;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function shadowTexture() {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 256
  const g = c.getContext('2d')
  g.filter = 'blur(18px)'
  g.fillStyle = 'rgba(17,22,31,1)'
  g.fillRect(48, 48, 160, 160)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function plateGeometry(idx, edge) {
  const g = new THREE.BoxGeometry(W, H, T)
  g.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1))
  g.setAttribute('aEdge', new THREE.InstancedBufferAttribute(edge, 1))
  const hi = new THREE.InstancedBufferAttribute(new Float32Array(idx.length), 1)
  g.setAttribute('aHi', hi)
  return g
}

export async function initScene(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  const dpr = () => Math.min(window.devicePixelRatio || 1, 1.5)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60)
  const camPos = new THREE.Vector3(0.55, 1.55, 8.4)
  const camAim = new THREE.Vector3(0.55, 0.42, 0)

  const loader = new THREE.TextureLoader()
  const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej))
  const hdName = (i) => `/frames/${FRAMES[i].file.replace('.jpg', '')}-hd.webp`
  const [atlas, hdA, hdB] = await Promise.all([load('/atlas.webp'), load(hdName(HD_BLOCK)), load(hdName(HD_PILE))])
  for (const t of [atlas, hdA, hdB]) {
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    t.minFilter = THREE.LinearMipmapLinearFilter
  }
  const makeMat = (opacity) => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    uniforms: { uAtlas: { value: atlas }, uHdA: { value: hdA }, uHdB: { value: hdB }, uHdAIdx: { value: HD_BLOCK }, uHdBIdx: { value: HD_PILE }, uOpacity: { value: opacity } },
  })

  // block mesh: instances drawn back to front (plate 105 first, plate 0, the front one, last)
  const bIdx = new Float32Array(N), bEdge = new Float32Array(N)
  const slotOfPlate = new Int32Array(N)
  for (let k = 0; k < N; k++) {
    const i = N - 1 - k
    slotOfPlate[i] = k
    bIdx[k] = i
    bEdge[k] = FRAMES[i].scene ? 1 : 0
  }
  const bGeo = plateGeometry(bIdx, bEdge)
  const bHiAttr = bGeo.getAttribute('aHi')
  const block = new THREE.InstancedMesh(bGeo, makeMat(0.86), N)
  block.renderOrder = 2
  block.frustumCulled = false

  // pile mesh: the read plates, in time order, back to front
  const pIdx = new Float32Array(M), pEdge = new Float32Array(M).fill(1)
  READ.forEach((f, r) => { pIdx[r] = f.i })
  const pile = new THREE.InstancedMesh(plateGeometry(pIdx, pEdge), makeMat(0.9), M)
  pile.renderOrder = 3
  pile.frustumCulled = false

  // contact shadows, precomputed blurred rectangles
  const shTex = shadowTexture()
  const shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  const blockShadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0.42 }))
  const pileShadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: 0 }))
  blockShadow.renderOrder = pileShadow.renderOrder = 1
  scene.add(blockShadow, pileShadow, block, pile)

  const readRank = new Int32Array(N).fill(-1)
  READ.forEach((f, r) => { readRank[f.i] = r })

  // state driven by scroll
  const st = { pr: reduced ? 1 : 0, ps: reduced ? 1 : 0, intro: reduced ? 1 : 0 }
  const hud = { el: document.querySelector('.stage-hud'), req: document.getElementById('hud-req'), what: document.getElementById('hud-what'), tag: document.querySelector('.tag-problem') }
  let dirty = true
  let active = true
  let hover = -1

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion()
  const v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), s0 = new THREE.Vector3(0, 0, 0)
  const Y = new THREE.Vector3(0, 1, 0)
  const bPos = new THREE.Vector3(), pPos = new THREE.Vector3(), pOut = new THREE.Vector3(), pTo = new THREE.Vector3()

  function pose() {
    const pr = smooth(clamp(st.pr))
    const ps = clamp(st.ps)
    const back = smooth(seg(ps, 0, 0.08))
    // quarter turn: +30 degrees to -60 degrees, then it settles back to -30 for the reading
    const rot = lerp(lerp(0.52, -1.05, pr), -0.52, back)
    const spread = lerp(pr, 0.0, back)
    const pitch = lerp(P0, P1, spread)
    const bx = lerp(lerp(1.15, 1.35, pr), 0.0, back)
    const bz = lerp(lerp(0, -1.2, pr), -0.4, back)
    const lift = (1 - outCubic(st.intro)) * 0.12
    bPos.set(bx, 0, bz)
    qa.setFromAxisAngle(Y, rot)
    // pile
    const cons = smooth(seg(ps, 0.88, 1))
    const pitchPile = lerp(PILE_P0, PILE_P1, cons)
    pPos.set(2.15, 0, 0.2)
    qb.setFromAxisAngle(Y, -0.38)

    const zc = (N - 1) / 2 * pitch
    for (let i = 0; i < N; i++) {
      const k = slotOfPlate[i]
      const r = readRank[i]
      let u = 0
      if (r >= 0) {
        const j = Math.floor(r / 5), mm = r % 5
        const uj = (ps - 0.08) / 0.8 * 12 - j
        u = clamp((uj - mm * 0.05) / 0.8)
      }
      // intro: plates settle onto the base, back ones last
      const introY = lift * (0.3 + 0.7 * (i / N))
      const lz = zc - i * pitch
      if (u <= 0) {
        v.set(0, H / 2 + introY, lz).applyQuaternion(qa).add(bPos)
        m4.compose(v, qa, s1)
        block.setMatrixAt(k, m4)
        if (r >= 0) pile.setMatrixAt(r, m4.compose(v, qa, s0))
        continue
      }
      block.setMatrixAt(k, m4.compose(bPos, qa, s0))
      // a: slide out of the block along its x, b: rise and turn face on, c: travel to the pile, d: settle (spring)
      const a = outCubic(seg(u, 0, 0.22)), b = inOut(seg(u, 0.22, 0.48)), c = inOut(seg(u, 0.48, 0.74)), d = spring(seg(u, 0.74, 1))
      pOut.set(1.85 * a, H / 2 + 0.32 * b, lz).applyQuaternion(qa).add(bPos)
      q.copy(qa).slerp(qb, b)
      pTo.set(0, H / 2, -((M - 1) / 2) * pitchPile + r * pitchPile).applyQuaternion(qb).add(pPos)
      pTo.y += 0.32 * (1 - d)
      if (c >= 1) pOut.copy(pTo); else pOut.lerp(pTo, c)
      m4.compose(pOut, q, s1)
      pile.setMatrixAt(r, m4)
    }
    block.instanceMatrix.needsUpdate = true
    pile.instanceMatrix.needsUpdate = true

    // shadows follow block and pile
    const depth = (N - 1) * pitch + T
    blockShadow.position.set(bPos.x, 0.001, bPos.z)
    blockShadow.quaternion.copy(qa)
    blockShadow.scale.set(W * 1.6, 1, depth * 1.6 + 0.3)
    const pileDepth = (M - 1) * pitchPile
    const landed = clamp((ps - 0.08) / 0.8)
    pileShadow.position.set(pPos.x, 0.001, pPos.z)
    pileShadow.quaternion.copy(qb)
    pileShadow.scale.set(W * 1.6, 1, pileDepth * landed * 1.6 + 0.3)
    pileShadow.material.opacity = 0.36 * clamp(landed * 6)

    // labels in the stage
    hud.tag.style.visibility = st.pr > 0.25 && ps < 0.02 ? 'visible' : 'hidden'
    hud.el.style.visibility = ps > 0.06 ? 'visible' : 'hidden'
    if (ps > 0.06) {
      const req = clamp(Math.floor((ps - 0.08) / 0.8 * 12) + 1, 1, 12)
      if (ps >= 0.88) {
        const done = ps >= 0.97
        hud.req.textContent = done ? 'SKILL.old-voice.md' : 'request 13 of 13'
        hud.what.textContent = done ? 'registered on the H Agents API, pinned at revision 2' : 'one text request puts the 12 answers together'
        hud.el.classList.toggle('is-skill', done)
      } else {
        hud.req.textContent = `request ${req} of 13`
        hud.what.textContent = `keyframes ${(req - 1) * 5 + 1} to ${req * 5} of 60 in, steps out`
        hud.el.classList.remove('is-skill')
      }
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    renderer.setPixelRatio(dpr())
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.position.copy(camPos)
    camera.lookAt(camAim)
    camera.updateProjectionMatrix()
    dirty = true
  }

  function render(force = false) {
    if ((!active || !dirty) && !force) return
    pose()
    renderer.render(scene, camera)
    dirty = false
  }

  resize()
  window.addEventListener('resize', resize)

  // scroll: the quarter turn over the problem, the slices over the next section (scrub 0.8)
  if (!reduced) {
    const mk = (key, trigger, start, end) => gsap.to(st, {
      [key]: 1, ease: 'none', onUpdate: () => { dirty = true },
      scrollTrigger: { trigger, start, end, scrub: 0.8 },
    })
    mk('pr', '#problem', 'top 95%', '+=100%')
    mk('ps', '#slices', 'top 70%', 'bottom bottom')
  }
  ScrollTrigger.create({ trigger: '#stage', start: 'top top', end: 'bottom top', onToggle: (s) => { active = s.isActive; dirty = true } })
  document.addEventListener('visibilitychange', () => { active = !document.hidden; dirty = true })

  // hover: the edge under the pointer lights up, one plate at a time, no rotation
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  canvas.addEventListener('pointermove', (e) => {
    if (st.pr > 0.05) return
    const rct = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - rct.left) / rct.width) * 2 - 1, -((e.clientY - rct.top) / rct.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObject(block, false)[0]
    const k = hit ? hit.instanceId : -1
    if (k !== hover) {
      if (hover >= 0) bHiAttr.array[hover] = 0
      if (k >= 0) bHiAttr.array[k] = 1
      hover = k
      bHiAttr.needsUpdate = true
      dirty = true
    }
  })
  canvas.addEventListener('pointerleave', () => { if (hover >= 0) { bHiAttr.array[hover] = 0; hover = -1; bHiAttr.needsUpdate = true; dirty = true } })

  gsap.ticker.add(() => render())

  pose()
  await renderer.compileAsync(scene, camera)
  renderer.initTexture(atlas); renderer.initTexture(hdA); renderer.initTexture(hdB)
  if (!reduced) gsap.to(st, { intro: 1, duration: 1.2, ease: 'power2.out', delay: 0.1, onUpdate: () => { dirty = true } })
  render(true)
  return { renderer, render: () => { dirty = true; render(true) } }
}
