// La pièce du sous-sol, 1983 (concepts.md 3.2) : bureau Synthesis 45, Olivetti M24, lampe Tizio, rayonnages de
// boîtes à archives, soupirail. Rien d'autre n'entre dans la pièce.
// Passe 3D : les objets du premier plan viennent de Blender (tools/blender/soussol_props.py, GLB meshopt, AO cuite en
// second canal UV), les matières CC0 (Poly Haven, ambientCG) sont en mosaïque sur des UV en mètres.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { C, mulberry } from './palette'

export const SCREEN = new THREE.Vector3(0, 1.052, 0.047)
export const DESK_Y = 0.72
export const TOP = DESK_Y + 0.03
export const HEAD = new THREE.Vector3(-0.2, TOP + 0.5, -0.02)

const TX = '/textures/3d/'

// plan aux UV en mètres (les matières en mosaïque se règlent en carreaux par mètre) ; uv1 garde le 0..1 des cuissons
function plane(w: number, h: number, uvOffsetY = 0) {
  const g = new THREE.PlaneGeometry(w, h)
  g.setAttribute('uv1', g.attributes.uv.clone())
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h + uvOffsetY)
  return g
}

export async function buildRoom(scene: THREE.Scene) {
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const tex = async (name: string, o: { srgb?: boolean; rep?: number; flip?: boolean; channel?: number } = {}) => {
    const t = await loader.loadAsync(TX + name + '.webp')
    t.colorSpace = o.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    if (o.rep) t.repeat.set(o.rep, o.rep)
    if (o.flip === false) t.flipY = false
    if (o.channel) t.channel = o.channel
    t.anisotropy = 8
    textures.push(t)
    return t
  }
  const gltfP = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/models/soussol_props.glb')
  const [
    plasterC, plasterN, plasterR, concC, concN, concR, absN, absR, lacN, lacR, steelN, steelR,
    boxC, boxN, boxR, upC, upN, propsAO, floorAO, wallAO, gltf,
  ] = await Promise.all([
    tex('tex_plaster_col', { srgb: true, rep: 0.6 }), tex('tex_plaster_nor', { rep: 0.6 }), tex('tex_plaster_rough', { rep: 0.6 }),
    tex('tex_concrete_col', { srgb: true, rep: 0.7 }), tex('tex_concrete_nor', { rep: 0.7 }), tex('tex_concrete_rough', { rep: 0.7 }),
    tex('tex_abs_nor', { rep: 7 }), tex('tex_abs_rough', { rep: 7 }), tex('tex_lacquer_nor', { rep: 3 }), tex('tex_lacquer_rough', { rep: 3 }),
    tex('tex_steel_nor', { rep: 4 }), tex('tex_steel_rough', { rep: 4 }),
    tex('box_col', { srgb: true }), tex('box_nor'), tex('box_rough'), tex('upright_col', { srgb: true }), tex('upright_nor'),
    tex('props_ao', { flip: false, channel: 1 }), tex('floor_ao', { channel: 1 }), tex('wall_ao', { channel: 1 }),
    gltfP,
  ])
  for (const t of [boxC, boxN, boxR]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  upC.repeat.set(1, 40); upN.repeat.set(1, 40)

  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
  const ns = (s: number) => new THREE.Vector2(s, s)
  // matières du GLB, par nom (couleurs de concepts.md 3.9, rugosité modulée par la carte)
  const abs = { normalMap: absN, roughnessMap: absR, normalScale: ns(0.5), aoMap: propsAO }
  const P: Record<string, THREE.Material> = {
    deskTop: std({ color: C.deskTop, roughness: 0.5, metalness: 0.15, normalMap: lacN, roughnessMap: lacR, normalScale: ns(0.35), aoMap: propsAO }),
    abs: std({ color: C.abs, roughness: 0.62, ...abs }),
    m24: std({ color: C.m24, roughness: 0.55, ...abs }),
    m24dark: std({ color: C.m24dark, roughness: 0.6, ...abs }),
    keyL: std({ color: 0xb8b1a3, roughness: 0.5, ...abs }),
    keyD: std({ color: 0x6e6d69, roughness: 0.55, ...abs }),
    drive: std({ color: 0x1c1d1d, roughness: 0.5, ...abs }),
    crt: std({ color: 0x090a0a, roughness: 0.18, metalness: 0, aoMap: propsAO }),
    lamp: std({ color: C.lamp, roughness: 0.4, metalness: 0.1, normalMap: lacN, roughnessMap: lacR, normalScale: ns(0.4), aoMap: propsAO }),
    lampMetal: std({ color: 0x8a8a88, roughness: 0.3, metalness: 0.7, aoMap: propsAO }),
    steelDark: std({ color: 0x2b3133, roughness: 0.5, metalness: 0.2, normalMap: steelN, roughnessMap: steelR, aoMap: propsAO }),
    plaster: std({ color: C.wall, roughness: 1, normalMap: plasterN, roughnessMap: plasterR, normalScale: ns(0.8), aoMap: propsAO }),
    red: std({ color: 0x6a1812, roughness: 0.5, aoMap: propsAO }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xfff1d6, fog: false }),
  }
  // l'AO cuite assombrit aussi un peu la lumière directe (cavités, fentes, joints entre touches), à 55 %
  for (const m of Object.values(P)) aoDirect(m)
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const name = (m.material as THREE.Material).name
    if (P[name]) m.material = P[name]
    m.castShadow = !['bulb', 'red', 'plaster', 'steelDark'].includes(name)
    m.receiveShadow = true
  })
  scene.add(gltf.scene)

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true, receive = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m
  }

  // la pièce : sol de béton, mur et plafond de plâtre peint ; l'allée et le mur du fond portent leur AO cuite
  const wallM = std({ color: C.wall, roughness: 1, map: plasterC, normalMap: plasterN, roughnessMap: plasterR, normalScale: ns(0.9) })
  const floorM = std({ color: C.floor, roughness: 0.9, map: concC, normalMap: concN, roughnessMap: concR, normalScale: ns(0.6) })
  add(plane(30, 30), floorM, 0, -0.003, 5, false, true).rotation.x = -Math.PI / 2
  const floorNear = floorM.clone(); floorNear.aoMap = floorAO; aoDirect(floorNear, 0.5)
  add(plane(6, 9), floorNear, 0, 0, 3.75, false, true).rotation.x = -Math.PI / 2
  add(plane(30, 4), wallM, 0, 2, -0.752, false, true)
  const wallNear = wallM.clone(); wallNear.aoMap = wallAO; aoDirect(wallNear, 0.5)
  add(plane(6, 2.7), wallNear, 0, 1.35, -0.75, false, true)
  add(plane(30, 30), wallM, 0, 2.7, 5, false, false).rotation.x = Math.PI / 2

  // soupirail : la vitre donne sur le jour froid de la rue, derrière le châssis et les barreaux du GLB
  const winC = document.createElement('canvas'); winC.width = 128; winC.height = 32
  {
    const x = winC.getContext('2d')!
    const g = x.createLinearGradient(0, 0, 0, 32); g.addColorStop(0, '#b9d2dc'); g.addColorStop(0.55, '#7c9ba6'); g.addColorStop(1, '#4a636b')
    x.fillStyle = g; x.fillRect(0, 0, 128, 32)
  }
  const winT = new THREE.CanvasTexture(winC); winT.colorSpace = THREE.SRGBColorSpace
  textures.push(winT)
  add(new THREE.PlaneGeometry(0.84, 0.24), new THREE.MeshBasicMaterial({ map: winT, color: 0xb0c4cc, fog: false }), -0.75, 2.47, -0.742, false, false)
  scene.add(buildRay())

  // rayonnages : montants perforés, tablettes à bord replié, boîtes à archives (dos : étiquette et trou de préhension)
  const steelM: THREE.Matrix4[] = []
  const shelfM: THREE.Matrix4[] = []
  const boxM: { m: THREE.Matrix4; c: THREE.Color }[] = []
  const tmp = new THREE.Object3D()
  const rng = mulberry(713)
  const SHELVES = [0.08, 0.5, 0.92, 1.34, 1.76]
  const carton = [0x8a7e69, 0x7d725f, 0x968a73, 0x6f6656].map((c) => new THREE.Color(c))
  const push = (arr: THREE.Matrix4[], x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    tmp.position.set(x, y, z); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); arr.push(tmp.matrix.clone())
  }
  const rack = (x: number, z0: number, z1: number, face: number, fill = 0.92) => {
    const depth = 0.42
    for (let z = z0; z <= z1 + 1e-3; z += 1) {
      push(steelM, x - face * depth / 2, 1.0, z, 0.03, 2.0, 0.03)
      push(steelM, x + face * depth / 2, 1.0, z, 0.03, 2.0, 0.03)
    }
    for (const y of SHELVES) push(shelfM, x, y, (z0 + z1) / 2, depth, 1, z1 - z0)
    for (const y of SHELVES) {
      for (let z = z0 + 0.04; z < z1 - 0.1; z += 0.1) {
        if (rng() > fill) continue
        const h = rng() < 0.7 ? 0.33 : 0.25
        tmp.position.set(x + face * 0.04, y + 0.008 + h / 2, z + 0.05); tmp.scale.set(0.3, h, 0.094); tmp.updateMatrix()
        boxM.push({ m: tmp.matrix.clone(), c: carton[Math.floor(rng() * carton.length)].clone().multiplyScalar(0.85 + rng() * 0.3) })
      }
    }
  }
  rack(-1.15, -0.65, 1.55, 1); rack(1.15, -0.65, 1.55, -1)
  rack(-1.15, 2.65, 5.65, 1); rack(1.15, 2.65, 5.65, -1)
  for (let k = 1; k <= 5; k++) { rack(-1.15 - k * 1.1, -0.65, 5.65, 1, 0.85); rack(1.15 + k * 1.1, -0.65, 5.65, -1, 0.85) }
  const upMat = std({ color: C.steel, roughness: 0.55, metalness: 0.1, map: upC, normalMap: upN, alphaTest: 0.5, side: THREE.DoubleSide })
  const steelI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), upMat, steelM.length)
  steelM.forEach((m, i) => steelI.setMatrixAt(i, m))
  steelI.receiveShadow = true
  scene.add(steelI)
  // tablette : plateau et bord replié vers le bas de 3,5 cm des deux côtés, en une géométrie (échelle x = profondeur)
  const shelfGeo = mergeBoxes([
    new THREE.BoxGeometry(1, 0.012, 1),
    new THREE.BoxGeometry(0.02 / 0.42, 0.035, 1).translate(0.5 - 0.01 / 0.42, -0.017, 0),
    new THREE.BoxGeometry(0.02 / 0.42, 0.035, 1).translate(-0.5 + 0.01 / 0.42, -0.017, 0),
  ])
  const shelfI = new THREE.InstancedMesh(shelfGeo, std({ color: C.steel, roughness: 0.5, metalness: 0.1, normalMap: steelN, roughnessMap: steelR }), shelfM.length)
  shelfM.forEach((m, i) => shelfI.setMatrixAt(i, m))
  shelfI.receiveShadow = true
  scene.add(shelfI)
  // boîte : les faces x (dos, vers l'allée) prennent la moitié gauche de l'atlas, les autres le carton nu
  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  {
    const uv = boxGeo.attributes.uv as THREE.BufferAttribute
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k
      uv.setX(i, f < 2 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5)
    }
    // occlusion de contact en couleur de sommet : le bas de chaque boîte, posé sur la tablette, plus sombre
    const pos = boxGeo.attributes.position as THREE.BufferAttribute
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { const v = 0.72 + 0.28 * (pos.getY(i) + 0.5); col.set([v, v, v], i * 3) }
    boxGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  const boxI = new THREE.InstancedMesh(boxGeo, std({ roughness: 1, map: boxC, normalMap: boxN, roughnessMap: boxR, vertexColors: true }), boxM.length)
  ;(boxI.material as THREE.MeshStandardMaterial).color.setScalar(1.55) // l'atlas de carton est à mi teinte : on rend aux boîtes leur valeur
  boxM.forEach(({ m, c }, i) => { boxI.setMatrixAt(i, m); boxI.setColorAt(i, c) })
  boxI.receiveShadow = true
  scene.add(boxI)

  // lumière : la Tizio (seule ombre), l'écran (ambre sur le clavier), le soupirail (froid au sol), un appoint lointain
  scene.add(new THREE.HemisphereLight(0x3a5258, 0x0a1214, 0.75))
  const tizio = new THREE.SpotLight(0xffd3a0, 7, 3.2, 0.78, 0.65, 2)
  tizio.position.copy(HEAD).add(new THREE.Vector3(0, -0.02, 0))
  tizio.target.position.set(-0.05, TOP, 0.12)
  tizio.castShadow = true
  tizio.shadow.mapSize.set(1024, 1024)
  tizio.shadow.radius = 4
  tizio.shadow.bias = -0.0004
  tizio.shadow.normalBias = 0.002
  tizio.shadow.camera.near = 0.05; tizio.shadow.camera.far = 3
  scene.add(tizio, tizio.target)
  // le rebond chaud de la Tizio sur le bureau, qui rend au boîtier du M24 son gris chaud
  const bounce = new THREE.PointLight(0xffc890, 0.9, 1.6, 2)
  bounce.position.set(-0.15, TOP + 0.12, 0.35)
  scene.add(bounce)
  const screenLight = new THREE.RectAreaLight(0xffa640, 9, 0.27, 0.17)
  screenLight.position.set(0, SCREEN.y, SCREEN.z + 0.01)
  screenLight.lookAt(0, SCREEN.y - 0.1, 1)
  scene.add(screenLight)
  const cold = new THREE.SpotLight(0x9cc4d4, 3, 6, 0.5, 0.9, 1.6)
  cold.position.set(-0.75, 2.4, -0.7)
  cold.target.position.set(-0.2, 0, 1.4)
  scene.add(cold, cold.target)
  const aisle = new THREE.PointLight(0x6a8a94, 3.2, 8, 1.4)
  aisle.position.set(0, 2.3, 2.1)
  scene.add(aisle)

  return { boxes: boxM.length, add, textures }
}

function aoDirect(m: THREE.Material, k = 0.55) {
  if (!(m as THREE.MeshStandardMaterial).aoMap) return
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `#include <aomap_fragment>
      reflectedLight.directDiffuse *= mix(1.0, ambientOcclusion, ${k.toFixed(2)});
      reflectedLight.directSpecular *= mix(1.0, ambientOcclusion, ${k.toFixed(2)});`)
  }
  m.customProgramCacheKey = () => 'aoDirect' + k
}

function mergeBoxes(parts: THREE.BufferGeometry[]) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  let off = 0
  for (const p of parts) {
    pos.push(...(p.attributes.position.array as Float32Array))
    nor.push(...(p.attributes.normal.array as Float32Array))
    uv.push(...(p.attributes.uv.array as Float32Array))
    for (const i of p.index!.array) idx.push(i + off)
    off += p.attributes.position.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

// Le rai du soupirail : un tronc de pyramide ouvert, de la vitre vers l'allée, rendu en additif. Plus clair vu par
// la tranche (une lame de lumière dans l'air), il s'efface en descendant et porte l'ombre des cinq barreaux et du
// meneau, qui s'élargit en pénombre avec la distance. Sans particules (concepts.md 3.2), immobile.
function buildRay() {
  const A = new THREE.Vector3(-0.75, 2.47, -0.72)
  const dir = new THREE.Vector3(0.55, -2.47, 2.12).normalize()
  const L = 2.9
  const w0 = 0.8, h0 = 0.2, w1 = 1.05, h1 = 0.42
  const ax = new THREE.Vector3(1, 0, 0)
  const ay = new THREE.Vector3().crossVectors(dir, ax).normalize()
  const corner = (t: number, sx: number, sy: number) => {
    const w = w0 + (w1 - w0) * t, h = h0 + (h1 - h0) * t
    return A.clone().addScaledVector(dir, L * t).addScaledVector(ax, (sx * w) / 2).addScaledVector(ay, (sy * h) / 2)
  }
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const N = 12
  const faces: [number, number, number, number][] = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]
  for (const [x0, y0, x1, y1] of faces) {
    const base = pos.length / 3
    const wide = y0 === y1 // faces larges : u suit la vitre, pour les barreaux
    for (let i = 0; i <= N; i++) {
      const t = i / N
      for (const [sx, sy] of [[x0, y0], [x1, y1]]) {
        const p = corner(t, sx, sy); pos.push(p.x, p.y, p.z)
        uv.push(wide ? (sx + 1) / 2 : -1, t)
      }
    }
    for (let i = 0; i < N; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx); g.computeVertexNormals()
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(0x9fc6d6) }, uOpacity: { value: 0.026 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float bars(float u, float t) {
        float pen = 0.012 + 0.03 * t;
        float s = 1.0;
        for (int k = 0; k < 5; k++) {
          float c = 0.5 + (float(k) - 2.0) * 0.183;
          s *= mix(0.6, 1.0, smoothstep(0.009, 0.009 + pen, abs(u - c)));
        }
        return s * mix(0.62, 1.0, smoothstep(0.012, 0.012 + pen, abs(u - 0.5)));
      }
      void main() {
        float t = vUv.y;
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = smoothstep(0.0, 0.08, t) * pow(1.0 - t, 1.8);
        float b = vUv.x < 0.0 ? 1.0 : bars(vUv.x, t) * smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
        gl_FragColor = vec4(uColor * uOpacity * fade * (0.35 + edge) * b, 1.0);
      }`,
  })
  const m = new THREE.Mesh(g, mat)
  m.renderOrder = 2
  return m
}
