// Le relief de la voix : la piste audio réelle du tutoriel de 2021 (7 min 00) moulée dans le plâtre, lue en lumière
// rasante. La donnée est la géométrie : retirer voice.json aplatit le plâtre.
import { useMemo, useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import voice from '../data/voice.json'
import { STEPS, VIDEO } from '../data/content'
import type { Pose } from '../light'

/** rendu logiciel (SwiftShader, llvmpipe) : maillage et ombres réduits, pour regarder sur une machine sans GPU */
export let LITE = false
export function setLite(v: boolean) { LITE = v }
export const LEN = 24 // unités pour 7 min 00
export const DEPTH = 5
const Z_RIDGE = -0.55
export const Z_PLAQ = 1.55
export const Z_GROOVE = 2.15
const PLAQ_W = 0.3, PLAQ_H = 0.12, PLAQ_D = 0.42
const SUNK = -PLAQ_H / 2 - 0.004, RAISED = -PLAQ_H / 2 + 0.085

export const xOfT = (t: number) => (t / VIDEO.duration) * LEN - LEN / 2

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }

function blur(a: number[], sigma: number) {
  const r = Math.ceil(sigma * 3), k: number[] = []
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)))
  const sum = k.reduce((x, y) => x + y, 0)
  return a.map((_, j) => { let v = 0; for (let i = -r; i <= r; i++) v += (a[Math.min(a.length - 1, Math.max(0, j + i))] ?? 0) * k[i + r]; return v / sum })
}
// lissage d'environ 0,8 s (4 colonnes de 0,2 s) : la crête suit les phrases, pas chaque syllabe
const RMS = blur(voice.rms, 4)
const BANDS = voice.bands.map((b) => blur(b, 6))
function sample(arr: number[], u: number) {
  const f = clamp(u) * (arr.length - 1), i = Math.floor(f), k = f - i
  return ((arr[i] ?? 0) * (1 - k) + (arr[Math.min(arr.length - 1, i + 1)] ?? 0) * k) / 1000
}
const sq = (v: number) => v * v
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s) }

/** Hauteur du plâtre en (x, z). Crête centrale : l'enveloppe RMS ; sillons de part et d'autre : 8 bandes d'énergie. */
export function heightAt(x: number, z: number) {
  const u = (x + LEN / 2) / LEN
  const edgeX = smooth(0, 0.012, u) * smooth(1, 0.988, u)
  const e = sample(RMS, u)
  const w = 0.32 + 0.85 * e
  const dz = z - Z_RIDGE
  let h = 0.26 * Math.pow(e, 0.85) * Math.exp(-sq(dz / w))
  const ad = Math.abs(dz)
  for (let i = 0; i < 8; i++) {
    const zi = 0.62 + i * 0.16
    const b = sample(BANDS[i], u)
    h += 0.028 * b * Math.exp(-sq((ad - zi) / 0.055)) * (dz > 0 ? 0.55 : 1)
  }
  h *= edgeX
  // le sillon de la graduation, creusé sur toute la longueur, et une encoche par minute
  h -= 0.018 * Math.exp(-sq((z - Z_GROOVE) / 0.035)) * smooth(-LEN / 2 - 0.4, -LEN / 2, x) * smooth(LEN / 2 + 0.4, LEN / 2, x)
  const m = ((x + LEN / 2) / LEN) * VIDEO.duration / 60
  const near = Math.abs(m - Math.round(m)) * (LEN / (VIDEO.duration / 60))
  if (Math.round(m) <= 7) h -= 0.014 * Math.exp(-sq(near / 0.03)) * Math.exp(-sq((z - Z_GROOVE - 0.12) / 0.1))
  // fenêtre en z : le relief rentre dans la dalle
  h *= smooth(DEPTH / 2, DEPTH / 2 - 0.35, Math.abs(z))
  return h + (hash(x, z) - 0.5) * 0.0016
}

function grainTexture() {
  const N = 256, data = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const v = 236 + Math.floor((hash(i % N, Math.floor(i / N)) - 0.5) * 16)
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v + 1; data[i * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(data, N, N)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

// Uniformes partagés : la bande de lumière rasante ne module que la lumière clé (index 0)
const bandUniforms = { uBandX: { value: -99 }, uBandW: { value: 1.25 }, uBandOn: { value: 0 }, uFloor: { value: 0.3 } }
function plaster(opts: THREE.MeshStandardMaterialParameters) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0, ...opts })
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bandUniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWX;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wpBand = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpBand = instanceMatrix * wpBand;
        #endif
        vWX = (modelMatrix * wpBand).x;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWX;\nuniform float uBandX; uniform float uBandW; uniform float uBandOn; uniform float uFloor;')
      .replace('getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
        if ( UNROLLED_LOOP_INDEX == 0 ) {
          float bd = (vWX - uBandX) / uBandW;
          float lead = vWX < uBandX ? exp(-bd * bd * 0.18) : exp(-bd * bd);
          directLight.color *= mix(1.0, uFloor + (1.0 - uFloor) * lead, uBandOn);
        }`)
  }
  return m
}

export type ReliefApi = {
  apply: (p: Pose) => void
  project: (camera: THREE.Camera, w: number, h: number) => { steps: { x: number; y: number; r: number }[]; ticks: { x: number; y: number }[]; bandX: number }
  scene: THREE.Scene | null
}
const COOL = new THREE.Color('#f3f6fa'), WARM = new THREE.Color('#ffd9a3')
export const relief: ReliefApi = { apply: () => {}, project: () => ({ steps: [], ticks: [], bandX: 0 }), scene: null }

export function Relief() {
  const { scene, camera, size } = useThree()

  const built = useMemo(() => {
    const grain = grainTexture()
    grain.repeat.set(26, 5.2)
    const mat = plaster({ color: new THREE.Color('#e8edf1'), map: grain })
    const geo = new THREE.PlaneGeometry(LEN + 1.2, DEPTH, LITE ? 512 : 1024, LITE ? 100 : 200)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)))
    geo.computeVertexNormals()
    const strip = new THREE.Mesh(geo, mat)
    strip.castShadow = true; strip.receiveShadow = true

    const surroundMat = plaster({ color: new THREE.Color('#e8edf1') })
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2), surroundMat)
    surround.position.y = -0.0004
    surround.receiveShadow = true

    const plaqMat = plaster({ color: new THREE.Color('#ffffff'), map: grain })
    const plaqGeo = new RoundedBoxGeometry(PLAQ_W, PLAQ_H, PLAQ_D, 3, 0.025)
    const plaq = new THREE.InstancedMesh(plaqGeo, plaqMat, STEPS.length)
    plaq.castShadow = true; plaq.receiveShadow = true
    const white = new THREE.Color('#f1f3f5'), green = new THREE.Color('#b9dcd2')
    STEPS.forEach((s, i) => plaq.setColorAt(i, s.aside ? green : white))
    plaq.frustumCulled = false

    const key = new THREE.DirectionalLight(new THREE.Color('#ffe0b0'), 3.1)
    key.castShadow = true
    key.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048)
    Object.assign(key.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 90 })
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.018
    key.shadow.radius = 2.5
    const fill = new THREE.DirectionalLight(new THREE.Color('#dbe6f2'), 0.32)
    fill.position.set(20, 30, 14)
    const hemi = new THREE.HemisphereLight(new THREE.Color('#e4ecf6'), new THREE.Color('#b9c0c8'), 1.15)

    const group = new THREE.Group()
    group.add(strip, surround, plaq, key, key.target, fill, hemi)
    return { group, plaq, key, mats: [mat, surroundMat, plaqMat], geos: [geo, plaqGeo], grain }
  }, [])

  useEffect(() => {
    scene.add(built.group)
    relief.scene = scene
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3()
    const rise = new Float32Array(STEPS.length)
    relief.apply = (p: Pose) => {
      const el = THREE.MathUtils.degToRad(p.elev), az = THREE.MathUtils.degToRad(p.azim)
      const dir = new THREE.Vector3(-Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
      const bx = THREE.MathUtils.lerp(-LEN / 2, LEN / 2, p.band)
      built.key.target.position.set(0, 0, 0)
      built.key.position.copy(dir.multiplyScalar(40))
      // une lumière basse est plus chaude qu'une lumière haute : du blanc froid à 70 degrés à l'ocre pâle sous 12
      built.key.color.copy(COOL).lerp(WARM, smooth(40, 10, p.elev))
      built.key.intensity = 2.2 + 0.8 * smooth(40, 10, p.elev)
      bandUniforms.uBandX.value = bx
      bandUniforms.uBandOn.value = p.bandOn
      STEPS.forEach((st, i) => {
        const x = xOfT(st.t)
        // la plaquette se moule quand la bande atteint son instant : ombre d'abord, puis la montée
        rise[i] = smooth(x - 0.05, x + 0.9, bx)
        const y = THREE.MathUtils.lerp(SUNK, RAISED, rise[i])
        m.compose(v.set(x, y, Z_PLAQ), q, s)
        built.plaq.setMatrixAt(i, m)
      })
      built.plaq.instanceMatrix.needsUpdate = true
    }
    const tmp = new THREE.Vector3()
    relief.project = (cam, w, h) => {
      const toScreen = (x: number, y: number, z: number) => { tmp.set(x, y, z).project(cam); return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h } }
      const steps = STEPS.map((st, i) => ({ ...toScreen(xOfT(st.t), 0.1, Z_PLAQ - PLAQ_D / 2 - 0.08), r: rise[i] }))
      const ticks = Array.from({ length: 8 }, (_, mn) => toScreen(xOfT(mn * 60), 0, Z_GROOVE + 0.42))
      return { steps, ticks, bandX: toScreen(bandUniforms.uBandX.value, 0, Z_RIDGE).x }
    }
    return () => {
      scene.remove(built.group)
      built.mats.forEach((x) => x.dispose()); built.geos.forEach((x) => x.dispose()); built.grain.dispose()
    }
  }, [scene, built])

  // cadrage : toute la longueur (7 min 00) dans la largeur, légère plongée, le relief dans le bas de l'écran
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = Math.max(1.1, size.width / size.height)
    cam.fov = 22
    const halfW = (LEN + 1.6) / 2
    const d = halfW / (Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * aspect)
    const el = THREE.MathUtils.degToRad(58)
    cam.position.set(0, Math.sin(el) * d, Math.cos(el) * d + 0.2)
    cam.lookAt(0, 0, 0.2)
    cam.setViewOffset(size.width, size.height, 0, -size.height * 0.17, size.width, size.height)
    cam.near = 1; cam.far = 200
    cam.updateProjectionMatrix()
  }, [camera, size])

  return null
}
