// Couleurs de la scène du sous-sol (concepts.md 3.9), en valeurs three.
export const C = {
  cellar: 0x0a1b20,
  wall: 0x1a2a2f,
  floor: 0x1d2629,
  deskTop: 0x8d8e8a, // tôle laquée gris Synthesis
  abs: 0x2a2c2d,
  m24: 0xd6d2c8,
  m24dark: 0x3a3b3a,
  steel: 0x5d676a,
  lamp: 0x111213,
}

export function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
