// Le fond du site sous le hero (V2 point 20) : un plâtre beige en relief, à peine animé (dérive lente du bruit) et
// éclairé par une lumière rasante qui suit la souris avec retard. Rendu au tiers de la taille de l'écran puis étiré :
// une passe de bruit par pixel, quelques dixièmes de milliseconde. Coupé sous le hero, onglet caché, mouvement réduit.
import { gsap } from 'gsap'

const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`
const FRAG = `precision mediump float; varying vec2 v; uniform vec2 res; uniform float t; uniform vec2 light; uniform vec3 base;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int k = 0; k < 4; k++) { s += a * n(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
void main(){
  vec2 q = v * res / 220.;
  vec2 drift = vec2(t * .006, -t * .004);
  float e = .02;
  float c = fbm(q + drift), cx = fbm(q + drift + vec2(e, 0.)), cy = fbm(q + drift + vec2(0., e));
  vec3 nrm = normalize(vec3((c - cx) / e * .55, (c - cy) / e * .55, 1.));
  vec3 L = normalize(vec3(light - v, .55));
  float lam = dot(nrm, L);
  float grain = h(v * res + floor(t * 8.)) - .5;
  vec3 col = base * (0.955 + 0.06 * lam) + grain * .006;
  gl_FragColor = vec4(col, 1.);
}`

export function mountGround(opts: { reduced: boolean; heroGate?: () => boolean }) {
  const canvas = document.createElement('canvas')
  canvas.className = 'ground-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true })
  if (!gl) return
  document.body.prepend(canvas)
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
  const pr = gl.createProgram()!
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr)
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { canvas.remove(); return }
  gl.useProgram(pr)
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const uRes = gl.getUniformLocation(pr, 'res'), uT = gl.getUniformLocation(pr, 't'), uL = gl.getUniformLocation(pr, 'light'), uB = gl.getUniformLocation(pr, 'base')
  gl.uniform3f(uB, 0xed / 255, 0xeb / 255, 0xe7 / 255)
  const SCALE = 1 / 3
  const resize = () => { canvas.width = Math.max(2, Math.round(innerWidth * SCALE)); canvas.height = Math.max(2, Math.round(innerHeight * SCALE)); gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(uRes, innerWidth, innerHeight) }
  resize(); addEventListener('resize', resize)
  const target = { x: 0.3, y: 0.85 }, light = { x: 0.3, y: 0.85 }
  addEventListener('pointermove', (e) => { target.x = e.clientX / innerWidth; target.y = 1 - e.clientY / innerHeight }, { passive: true })
  const draw = (t: number) => { gl.uniform1f(uT, t); gl.uniform2f(uL, light.x, light.y); gl.drawArrays(gl.TRIANGLES, 0, 3) }
  draw(0)
  // mobile et écrans tactiles : la matière reste posée, une seule image devenue le fond du corps de page, et la toile
  // fixe disparaît (aucune couche plein écran à recomposer à chaque toucher) ; ailleurs elle vit à 12 i/s
  if (matchMedia('(max-width: 767px), (pointer: coarse)').matches) {
    const url = canvas.toDataURL('image/png')
    document.body.style.backgroundImage = `url(${url})`
    document.body.style.backgroundSize = '100vw 100vh'
    document.body.style.backgroundAttachment = 'fixed'
    canvas.remove()
    return
  }
  if (opts.reduced) return
  let last = 0
  gsap.ticker.add((time) => {
    if (document.hidden || (opts.heroGate && opts.heroGate())) return
    light.x += (target.x - light.x) * 0.04; light.y += (target.y - light.y) * 0.04
    if (time - last < 1 / 12) return // la matière vit lentement : 12 images par seconde suffisent, la page garde ses 60 i/s
    last = time
    draw(time)
  })
}
