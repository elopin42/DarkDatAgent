// La pièce du sous-sol, 1983 (concepts.md 3.2) : bureau Synthesis 45, Olivetti M24, lampe Tizio, rayonnages de
// boîtes à archives, soupirail. Rien d'autre n'entre dans la pièce.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { C, mulberry } from './palette'

export const SCREEN = new THREE.Vector3(0, 1.052, 0.047)
export const DESK_Y = 0.72
export const TOP = DESK_Y + 0.03

export async function buildRoom(scene: THREE.Scene) {
  const std = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
  const M = {
    wall: std(C.wall, 0.95), floor: std(C.floor, 0.85), desk: std(C.deskTop, 0.42, 0.1), abs: std(C.abs, 0.55),
    m24: std(C.m24, 0.5), m24dark: std(C.m24dark, 0.6), steel: std(C.steel, 0.55, 0.5), lamp: std(C.lamp, 0.35, 0.3),
  }
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true, receive = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; scene.add(m); return m
  }
  const rbox = (w: number, h: number, d: number, r = 0.006) => new RoundedBoxGeometry(w, h, d, 2, r)

  // la pièce
  add(new THREE.PlaneGeometry(30, 30), M.floor, 0, -0.002, 5, false, true).rotation.x = -Math.PI / 2
  // l'allée : lumière cuite sous Blender (Cycles sur la RTX), ombres de contact des rayonnages et du bureau comprises
  const floorTex = await new THREE.TextureLoader().loadAsync('/textures/floor-light.jpg')
  floorTex.colorSpace = THREE.SRGBColorSpace
  floorTex.anisotropy = 8
  add(new THREE.PlaneGeometry(6, 9), new THREE.MeshBasicMaterial({ map: floorTex, color: 0xffffff }), 0, 0, 3.75, false, false).rotation.x = -Math.PI / 2
  add(new THREE.PlaneGeometry(30, 4), M.wall, 0, 2, -0.75, false, true)
  add(new THREE.PlaneGeometry(30, 30), M.wall, 0, 2.7, 5, false, false).rotation.x = Math.PI / 2

  // soupirail, en haut du mur du fond, à gauche
  add(new THREE.PlaneGeometry(0.8, 0.22), new THREE.MeshBasicMaterial({ color: 0x40606a, fog: true }), -0.75, 2.47, -0.745, false, false)
  add(new THREE.BoxGeometry(0.98, 0.04, 0.08), M.wall, -0.75, 2.25, -0.72, false, true)
  const rayCanvas = document.createElement('canvas'); rayCanvas.width = 64; rayCanvas.height = 256
  {
    const x = rayCanvas.getContext('2d')!
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = g; x.fillRect(0, 0, 64, 256)
    const h = x.createLinearGradient(0, 0, 64, 0)
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.3, 'rgba(0,0,0,0)'); h.addColorStop(0.7, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)')
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256)
  }
  const rayTex = new THREE.CanvasTexture(rayCanvas); rayTex.colorSpace = THREE.SRGBColorSpace
  const ray = add(new THREE.PlaneGeometry(0.6, 2.6), new THREE.MeshBasicMaterial({
    map: rayTex, color: 0x9fc6d6, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }), -0.62, 1.25, -0.25, false, false)
  ray.rotation.set(-0.42, 0.18, 0.12)

  // bureau Synthesis 45 et son caisson
  add(rbox(1.6, 0.03, 0.8, 0.008), M.desk, 0, DESK_Y + 0.015, 0)
  add(new THREE.BoxGeometry(0.03, DESK_Y, 0.74), M.abs, -0.76, DESK_Y / 2, 0)
  add(new THREE.BoxGeometry(1.5, 0.36, 0.02), M.abs, 0, DESK_Y - 0.2, -0.36)
  add(rbox(0.42, DESK_Y - 0.02, 0.7, 0.01), M.desk, 0.56, (DESK_Y - 0.02) / 2, 0)
  for (let k = 0; k < 3; k++) {
    add(new THREE.BoxGeometry(0.4, 0.004, 0.005), M.abs, 0.56, 0.2 + k * 0.17, 0.352, false, false)
    add(rbox(0.12, 0.018, 0.02, 0.004), M.abs, 0.56, 0.26 + k * 0.17, 0.36, false, false)
  }

  // Olivetti M24 : unité centrale, deux lecteurs, pied, moniteur 12 pouces
  add(rbox(0.4, 0.13, 0.38, 0.01), M.m24, 0, TOP + 0.065, -0.12)
  add(new THREE.BoxGeometry(0.15, 0.012, 0.004), M.m24dark, 0.09, TOP + 0.08, 0.071, false, false)
  add(new THREE.BoxGeometry(0.15, 0.012, 0.004), M.m24dark, 0.09, TOP + 0.045, 0.071, false, false)
  add(new THREE.BoxGeometry(0.4, 0.004, 0.004), M.m24dark, 0, TOP + 0.012, 0.071, false, false)
  add(new THREE.CylinderGeometry(0.06, 0.08, 0.03, 24), M.m24dark, 0, TOP + 0.145, -0.1)
  add(rbox(0.36, 0.3, 0.06, 0.012), M.m24, 0, SCREEN.y, SCREEN.z - 0.04)
  add(new THREE.BoxGeometry(0.3, 0.25, 0.22), M.m24, 0, SCREEN.y + 0.005, SCREEN.z - 0.18)
  add(new THREE.BoxGeometry(0.296, 0.19, 0.012), M.m24dark, 0, SCREEN.y, SCREEN.z - 0.008, false, false)

  // clavier type 1, 83 touches
  add(rbox(0.46, 0.028, 0.18, 0.006), M.m24, 0, TOP + 0.014, 0.25)
  {
    const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(0.019, 0.01, 0.018, 1, 0.003), M.m24dark, 83)
    const m = new THREE.Matrix4()
    let n = 0
    ;[15, 15, 15, 15, 13].forEach((count, r) => {
      for (let k = 0; k < count && n < 83; k++) {
        m.makeTranslation(-0.19 + k * 0.0235 + (r % 2) * 0.008, TOP + 0.032 + r * 0.001, 0.19 + r * 0.025)
        keys.setMatrixAt(n++, m)
      }
    })
    while (n < 83) { m.makeTranslation(0.205, TOP + 0.031, 0.19 + (n - 73) * 0.012); keys.setMatrixAt(n++, m) }
    keys.castShadow = true; keys.receiveShadow = true
    scene.add(keys)
  }

  // Tizio : base, bras noirs, contrepoids, tête
  const LB = new THREE.Vector3(-0.6, TOP, -0.22)
  add(new THREE.CylinderGeometry(0.055, 0.06, 0.03, 32), M.lamp, LB.x, LB.y + 0.015, LB.z)
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 8), M.lamp, LB.x, LB.y + 0.11, LB.z)
  const arm = (a: THREE.Vector3, b: THREE.Vector3, r = 0.005) => {
    const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), M.lamp, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  }
  const P0 = new THREE.Vector3(LB.x, LB.y + 0.19, LB.z)
  const P1 = new THREE.Vector3(-0.5, TOP + 0.55, -0.27)
  const HEAD = new THREE.Vector3(-0.2, TOP + 0.5, -0.02)
  const CW1 = new THREE.Vector3(-0.68, TOP + 0.1, -0.2)
  const CW2 = new THREE.Vector3(-0.66, TOP + 0.62, -0.31)
  arm(P0, P1); arm(P0, CW1, 0.004); arm(P1, HEAD); arm(P1, CW2, 0.004)
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16), M.lamp, CW1.x, CW1.y, CW1.z)
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 16), M.lamp, CW2.x, CW2.y, CW2.z)
  const head = add(new THREE.BoxGeometry(0.08, 0.025, 0.04), M.lamp, HEAD.x, HEAD.y, HEAD.z)
  head.rotation.z = -0.25
  // le verre de l'halogène, sous la tête et tourné avec elle
  const bulb = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff1d6, fog: false }))
  bulb.position.set(0, -0.0131, 0); bulb.rotation.x = Math.PI / 2
  head.add(bulb)

  // rayonnages : montants, tablettes et boîtes instanciés
  const steelM: THREE.Matrix4[] = []
  const boxM: { m: THREE.Matrix4; c: THREE.Color }[] = []
  const tmp = new THREE.Object3D()
  const rng = mulberry(713)
  const SHELVES = [0.08, 0.5, 0.92, 1.34, 1.76]
  const carton = [0x8a7e69, 0x7d725f, 0x968a73, 0x6f6656].map((c) => new THREE.Color(c))
  const pushSteel = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    tmp.position.set(x, y, z); tmp.scale.set(sx, sy, sz); tmp.updateMatrix(); steelM.push(tmp.matrix.clone())
  }
  const rack = (x: number, z0: number, z1: number, face: number, fill = 0.92) => {
    const depth = 0.42
    for (let z = z0; z <= z1 + 1e-3; z += 1) {
      pushSteel(x - face * depth / 2, 1.0, z, 0.03, 2.0, 0.03)
      pushSteel(x + face * depth / 2, 1.0, z, 0.03, 2.0, 0.03)
    }
    for (const y of SHELVES) pushSteel(x, y, (z0 + z1) / 2, depth, 0.015, z1 - z0)
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
  const steelI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.steel, steelM.length)
  steelM.forEach((m, i) => steelI.setMatrixAt(i, m))
  steelI.receiveShadow = true
  scene.add(steelI)
  const boxI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.92 }), boxM.length)
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

  return { boxes: boxM.length, add }
}
