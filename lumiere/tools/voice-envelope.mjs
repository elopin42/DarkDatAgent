// Enveloppe réelle de la voix du tutoriel 2021 (JZMgB1UItkk), pour le relief.
// Entrée : PCM s16le mono 16 kHz (ffmpeg -i data/videos/JZMgB1UItkk.mp4 -vn -ac 1 -ar 16000 -f s16le audio.raw)
// Sortie : src/data/voice.json : rms (fenêtres de 40 ms, ramenées à N colonnes), 8 bandes d'énergie (biquads).
import { readFileSync, writeFileSync } from 'node:fs'
const [, , input, output] = process.argv
const buf = readFileSync(input)
const n = buf.length >> 1
const x = new Float32Array(n)
for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768
const SR = 16000, WIN = 640, N = 2048
const nw = Math.floor(n / WIN)
const duration = n / SR
function rmsWin(sig) {
  const r = new Float32Array(nw)
  for (let w = 0; w < nw; w++) { let s = 0; for (let i = w * WIN; i < (w + 1) * WIN; i++) s += sig[i] * sig[i]; r[w] = Math.sqrt(s / WIN) }
  return r
}
function bandpass(sig, f0, q) {
  const w0 = 2 * Math.PI * f0 / SR, a = Math.sin(w0) / (2 * q), c = Math.cos(w0)
  const b0 = a, b2 = -a, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a
  const y = new Float32Array(sig.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < sig.length; i++) { const v = (b0 * sig[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = sig[i]; y2 = y1; y1 = v; y[i] = v }
  return y
}
function resample(r) { // moyenne par colonne, puis lissage gaussien de 3 fenêtres
  const out = new Float32Array(N)
  for (let k = 0; k < N; k++) { const a = Math.floor(k * nw / N), b = Math.max(a + 1, Math.floor((k + 1) * nw / N)); let s = 0; for (let i = a; i < b; i++) s += r[i]; out[k] = s / (b - a) }
  const g = [0.27901, 0.44198, 0.27901], sm = new Float32Array(N)
  for (let k = 0; k < N; k++) sm[k] = g[0] * out[Math.max(0, k - 1)] + g[1] * out[k] + g[2] * out[Math.min(N - 1, k + 1)]
  return sm
}
const norm = (a) => { const s = [...a].sort((p, q) => p - q); const hi = s[Math.floor(s.length * 0.995)] || 1; return [...a].map((v) => Math.min(1000, Math.round((v / hi) * 1000))) }
const rms = resample(rmsWin(x))
const centers = [150, 260, 450, 780, 1350, 2300, 3900, 6000]
const bands = centers.map((f) => norm(resample(rmsWin(bandpass(x, f, 1.2)))))
writeFileSync(output, JSON.stringify({ source: 'JZMgB1UItkk audio, RMS per 40 ms window, mean per column, gaussian 3', duration: +duration.toFixed(2), columns: N, rms: norm(rms), bandsHz: centers, bands }))
console.log('duration', duration.toFixed(2), 'windows', nw)
