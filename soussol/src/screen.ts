// L'écran du M24 : 640 par 400, police ROM du PC6300 en 80 colonnes et 25 lignes. Il lit les vraies images clés de
// 2021, tramées en ambre (Bayer 4x4 sur l'image seule), et tape ce que dit la voix, puis le skill qui s'écrit.
import data from './data/tutorial.json'
import { SITE_NAME, REPLAY_RUN } from './config'
import { VOICE_STEPS } from './chain'

type Voice = { t: number; s: string }
const voice = data.voice as Voice[]
const frameTimes = data.frameTimes as number[]
const N = frameTimes.length
const run = (data.runs as Array<Record<string, string>>).find((r) => r.run_id === REPLAY_RUN)!

export const W = 640, H = 400
const CW = 8, CH = 16
const AMBER = '#ffb347', DIM = '#a8641a', BG = '#140b04'
const FRAME_EVERY = 1.6 // s par image clé, lecture affichée « 2.5x »
const TYPE_MS = 38
const IMG = { x: 8, y: 24, w: 384, h: 240 }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const up = (s: string) => s.toUpperCase()

export type Mode = 'read' | 'skill'

export class M24Screen {
  canvas = document.createElement('canvas')
  private base = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  private bctx: CanvasRenderingContext2D
  private frames: (HTMLCanvasElement | null)[] = new Array(N).fill(null)
  private mode: Mode = 'read'
  private modeT0 = 0
  private skillK = 1 // part du skill écrite, pilotée par le scroll
  private lastKey = ''
  private srEl: HTMLElement | null

  constructor(srEl: HTMLElement | null) {
    this.canvas.width = this.base.width = W
    this.canvas.height = this.base.height = H
    this.ctx = this.canvas.getContext('2d')!
    this.bctx = this.base.getContext('2d', { willReadFrequently: false })!
    this.srEl = srEl
  }

  /** Charge et trame les images clés. Les premières d'abord, le reste au fil de l'eau. */
  async load(first = 4) {
    const loadOne = (i: number) => new Promise<void>((res) => {
      const img = new Image()
      img.onload = () => { requestAnimationFrame(() => { this.frames[i] = this.dither(img); res() }) }
      img.onerror = () => res()
      img.src = `/frames/${String(i + 1).padStart(3, '0')}.jpg`
    })
    await Promise.all(Array.from({ length: first }, (_, i) => loadOne(i)))
    ;(async () => { for (let i = first; i < N; i++) await loadOne(i) })()
  }

  private dither(img: HTMLImageElement) {
    const c = document.createElement('canvas'); c.width = IMG.w; c.height = IMG.h
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(img, 0, 0, IMG.w, IMG.h)
    const d = x.getImageData(0, 0, IMG.w, IMG.h)
    const p = d.data
    // trois niveaux : fond, ambre faible, ambre plein
    const lv = [[0x14, 0x0b, 0x04], [0xa8, 0x64, 0x1a], [0xff, 0xb3, 0x47]]
    for (let yy = 0; yy < IMG.h; yy++) for (let xx = 0; xx < IMG.w; xx++) {
      const o = (yy * IMG.w + xx) * 4
      const l = (p[o] * 0.299 + p[o + 1] * 0.587 + p[o + 2] * 0.114) / 255
      // les interfaces claires dominent : on tasse les blancs vers l'ambre faible, on garde les traits en plein
      const v = Math.pow(1 - l, 0.8) * 2.2 + 0.35
      const t = BAYER[(yy & 3) * 4 + (xx & 3)]
      const k = Math.min(2, Math.floor(v + t))
      const c2 = lv[k] // négatif de phosphore : les traits et le texte en ambre plein, le blanc des formulaires presque éteint
      p[o] = c2[0]; p[o + 1] = c2[1]; p[o + 2] = c2[2]; p[o + 3] = 255
    }
    x.putImageData(d, 0, 0)
    return c
  }

  /** Le skill s'écrit au scroll (0 à 1), réversible. */
  setSkill(k: number) { this.skillK = Math.max(0, Math.min(1, k)) }

  setMode(m: Mode, now: number) {
    if (m === this.mode) return
    this.mode = m; this.modeT0 = now; this.lastKey = ''
  }

  /** Redessine si l'état visible a changé. Renvoie vrai quand la texture doit être renvoyée au GPU. */
  update(now: number): boolean {
    const key = this.mode === 'read' ? this.readKey(now) : this.skillKey(now)
    if (key === this.lastKey) return false
    this.lastKey = key
    const b = this.bctx
    b.fillStyle = BG; b.fillRect(0, 0, W, H)
    b.font = `${CH}px PC6300`; b.textBaseline = 'top'
    if (this.mode === 'read') this.drawRead(now); else this.drawSkill(now)
    // halo du phosphore : une copie floutée sous le net, puis un léger balayage de lignes, sur le verre seulement
    const c = this.ctx
    c.globalCompositeOperation = 'source-over'
    c.filter = 'none'; c.fillStyle = BG; c.fillRect(0, 0, W, H)
    c.filter = 'blur(3px)'; c.globalAlpha = 0.7; c.drawImage(this.base, 0, 0)
    c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'lighten'; c.drawImage(this.base, 0, 0)
    c.globalCompositeOperation = 'source-over'
    c.fillStyle = 'rgba(0,0,0,0.16)'
    for (let y = 1; y < H; y += 2) c.fillRect(0, y, W, 1)
    return true
  }

  // ---------- lecture des images de 2021 ----------
  private readState(now: number) {
    const t = Math.max(0, now - 0.4)
    const i = Math.min(N - 1, Math.floor(t / FRAME_EVERY) % N)
    const ft = frameTimes[i]
    let line = voice[0]
    for (const v of voice) { if (v.t <= ft + 1.2) line = v; else break }
    const typed = Math.min(line.s.length, Math.floor(((t % FRAME_EVERY) * 1000) / TYPE_MS))
    const cursorOn = Math.floor(now / 0.53) % 2 === 0
    return { i, ft, line, typed, cursorOn }
  }
  private readKey(now: number) {
    const s = this.readState(now)
    return `r${s.i}.${s.typed}.${s.cursorOn ? 1 : 0}.${this.frames[s.i] ? 1 : 0}`
  }
  private drawRead(now: number) {
    const b = this.bctx
    const s = this.readState(now)
    this.bar(` ${up(SITE_NAME)}`, 'READ JZMGB1UITKK.MP4 ')
    const f = this.frames[s.i]
    if (f) b.drawImage(f, IMG.x, IMG.y)
    else { b.strokeStyle = DIM; b.strokeRect(IMG.x + 0.5, IMG.y + 0.5, IMG.w - 1, IMG.h - 1) }
    const col = 50
    const rows: [string, string][] = [
      ['FRAME', `${String(s.i + 1).padStart(3, '0')} OF ${N}`],
      ['TIME', `${mmss(s.ft)} OF 07:00`],
      ['SOURCE', 'DOLIBARR TUTORIAL'],
      ['DATE', '05/02/2021'],
      ['LICENCE', 'CC BY'],
      ['SPEED', '2.5X'],
    ]
    rows.forEach(([k, v], r) => { this.text(col, 2 + r * 2, k, DIM); this.text(col + 8, 2 + r * 2, v, AMBER) })
    // barre d'avancement en mode texte, un bloc par image lue
    const cells = 28, done = Math.round(((s.i + 1) / N) * cells)
    this.text(col, 15, '█'.repeat(done), AMBER)
    this.text(col + done, 15, '░'.repeat(cells - done), DIM)
    this.text(1, 17, `VOICE ${mmss(s.line.t)}`, DIM)
    const typed = up(s.line.s.slice(0, s.typed))
    const wrapped = wrap(typed, 70)
    wrapped.forEach((l, k) => this.text(1, 18 + k, l, AMBER))
    const last = wrapped[wrapped.length - 1] ?? ''
    if (s.cursorOn) this.block(1 + last.length, 18 + Math.max(0, wrapped.length - 1))
    this.text(1, 23, `Reading frame ${s.i + 1} of ${N}`, DIM)
    if (this.srEl && s.typed === s.line.s.length) this.srEl.textContent = `Frame ${s.i + 1} of ${N}. The voice says: ${s.line.s}`
  }

  // ---------- le skill qui s'écrit ----------
  private skillLines() {
    const L: [string, string][] = []
    L.push(['WRITING SKILL  TUTO-JZMGB1UITKK-OLD-VOICE', DIM])
    L.push(['', DIM])
    VOICE_STEPS.forEach((s, i) => {
      L.push([`${mmss(s.t)}  "${up(s.quote)}"`, DIM])
      L.push([`       STEP ${i + 1}  ${up(s.step)}`, AMBER])
    })
    L.push(['', DIM])
    L.push(['HOUSE RULE  TWO TRANSPORTS LEMAIRE: TAKE THE ONE WITH A SIREN', AMBER])
    L.push(['', DIM])
    L.push([`LAST VERIFIED RUN  ROW 3  ${up(run.verdict)}  ${run.steps} STEPS  ${run.duration_s} S`, AMBER])
    return L
  }
  private skillState(now: number) {
    const L = this.skillLines()
    const total = L.reduce((a, [l]) => a + l.length + 1, 0)
    const chars = Math.floor(this.skillK * total)
    return { L, chars, cursorOn: Math.floor(now / 0.53) % 2 === 0 }
  }
  private skillKey(now: number) {
    const s = this.skillState(now)
    const total = s.L.reduce((a, [l]) => a + l.length + 1, 0)
    return `s${Math.min(s.chars, total)}.${s.cursorOn ? 1 : 0}`
  }
  private drawSkill(now: number) {
    const s = this.skillState(now)
    this.bar(` ${up(SITE_NAME)}`, 'H MODELS API  HOLO4 ')
    let left = s.chars, row = 2, cx = 1, cy = 2
    let stepsDone = 0
    for (const [l, color] of s.L) {
      if (left <= 0) break
      const shown = l.slice(0, left)
      this.text(1, row, shown, color)
      if (l.includes('STEP') && shown.length === l.length) stepsDone++
      cx = 1 + shown.length; cy = row
      left -= l.length + 1; row++
    }
    if (s.cursorOn) this.block(cx, cy)
    this.text(1, 23, `Writing skill, step ${Math.max(1, Math.min(VOICE_STEPS.length, stepsDone + 1))} of ${VOICE_STEPS.length}`, DIM)
    if (this.srEl && left > 0) this.srEl.textContent = `The screen writes the skill: ${VOICE_STEPS.map((v, i) => `step ${i + 1}, ${v.step}`).join('. ')}. House rule: two Transports Lemaire, take the one with a SIREN.`
  }

  // ---------- primitives en mode texte ----------
  private text(col: number, row: number, s: string, color: string) {
    this.bctx.fillStyle = color
    this.bctx.fillText(s, col * CW, row * CH)
  }
  private block(col: number, row: number) {
    this.bctx.fillStyle = AMBER
    this.bctx.fillRect(col * CW, row * CH + 2, CW, CH - 3)
  }
  private bar(left: string, right: string) {
    const b = this.bctx
    b.fillStyle = AMBER; b.fillRect(0, 0, W, CH)
    b.fillStyle = BG
    b.fillText(left, 0, 0)
    b.fillText(right, W - right.length * CW, 0)
  }
}

function wrap(s: string, n: number) {
  const out: string[] = []
  let cur = ''
  for (const w of s.split(' ')) {
    if ((cur + ' ' + w).trim().length > n) { out.push(cur); cur = w } else cur = (cur + ' ' + w).trim()
  }
  out.push(cur)
  return out.slice(0, 3)
}
