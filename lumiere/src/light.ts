// L'état de la lumière, la seule variable globale de la direction. Le scroll la déplace, jamais le temps.
// p : progression du moment signature (0 à 1 sur l'écran épinglé du hero), q : section Problem (la lumière remonte).
import { reduced } from './clock'

export const light = {
  pTarget: 0, p: 0,
  qTarget: 0, q: 0,
  page: 0, // progression sur toute la page, pour l'angle des ombres CSS hors hero
  dirty: true,
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Lissage du scrub (1,0 dans le brief : environ une demi seconde pour rattraper). */
export function stepLight(dt: number) {
  const k = 1 - Math.exp(-dt / 0.22)
  const before = light.p + light.q
  light.p += (light.pTarget - light.p) * k
  light.q += (light.qTarget - light.q) * k
  if (Math.abs(light.pTarget - light.p) < 1e-4) light.p = light.pTarget
  if (Math.abs(light.qTarget - light.q) < 1e-4) light.q = light.qTarget
  if (Math.abs(light.p + light.q - before) > 1e-6) light.dirty = true
}

export type Pose = { elev: number; azim: number; band: number; bandOn: number; rise: number }
/** Concepts 5.8 : élévation 70 à 6 degrés sur 0 à 40 %, puis azimut de -60 à 60 degrés et la bande sur 40 à 100 %.
 *  Section Problem : la lumière remonte et aplatit le relief. Reduced motion : 18 degrés, tout lisible. */
export function pose(p = light.p, q = light.q): Pose {
  if (reduced) return { elev: 18, azim: -40, band: 1.2, bandOn: 0, rise: 0 }
  const elev0 = lerp(70, 7, smooth(0, 0.4, p))
  const azim = lerp(-60, 60, smooth(0.4, 1, p))
  const band = lerp(-0.04, 1.04, clamp((p - 0.4) / 0.6))
  const bandOn = smooth(0.38, 0.46, p) * (1 - smooth(0.985, 1, p))
  const elev = lerp(elev0, 64, smooth(0.05, 0.85, q))
  return { elev, azim, band, bandOn, rise: q }
}
