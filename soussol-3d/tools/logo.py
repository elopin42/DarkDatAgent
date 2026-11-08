# Le logo DarkDatAgent (SVG) : badge rond ambre sur pétrole noir, masse sombre aux bords ondulés (la dark data), orbite
# qui la traverse, l'agent en curseur bloc sur l'orbite, étoiles à quatre branches. Traits pleins ; le grain de
# sérigraphie n'est que dans l'aplat sombre (poussière d'ambre éparse), jamais sur les contours.
import math
cx, cy = 50, 50
A, D = "#faab3f", "#0a1b20"
pts = []
for i in range(180):
    a = 2 * math.pi * i / 180
    r = 19 + 2.6 * math.sin(5 * a + 0.6) + 1.4 * math.sin(9 * a + 1.3)
    pts.append((cx + r * math.cos(a) * 1.12, cy + r * math.sin(a) * 0.95))
blob = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts) + "Z"
def star(x, y, R, r):
    p = []
    for k in range(8):
        a = math.pi / 4 * k - math.pi / 2
        rr = R if k % 2 == 0 else r
        p.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    return "M" + " L".join(f"{a:.2f},{b:.2f}" for a, b in p) + "Z"
def svg(full):
    sw = 4 if full else 6
    dust = ('<filter id="dust" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="11"/>'
            '<feColorMatrix type="matrix" values="0 0 0 0 0.98  0 0 0 0 0.67  0 0 0 0 0.25  0 0 0 14 -10.2"/></filter>') if full else ''
    stars = (f'<path d="{star(27,28,6,1.4)}" fill="{A}"/><path d="{star(73,72,7,1.6)}" fill="{A}"/><path d="{star(77,29,3.5,0.9)}" fill="{A}"/>'
             f'<g fill="{A}"><circle cx="22" cy="58" r="1"/><circle cx="35" cy="80" r="0.9"/><circle cx="62" cy="18" r="0.9"/><circle cx="85" cy="50" r="0.8"/><circle cx="58" cy="84" r="1.1"/></g>') if full else \
            f'<path d="{star(26,28,7,1.8)}" fill="{A}"/><path d="{star(74,73,7,1.8)}" fill="{A}"/>'
    ell = lambda stroke, w: f'<ellipse cx="50" cy="50" rx="41" ry="12" fill="none" stroke="{stroke}" stroke-width="{w}" transform="rotate(-18 50 50)"/>'
    ax, ay = 50 + 41 * math.cos(math.radians(62)), 50 + 12 * math.sin(math.radians(62))
    body = (f'<circle cx="50" cy="50" r="49" fill="{D}"/>'
            + (f'<g clip-path="url(#disc)"><rect x="6" y="6" width="88" height="88" fill="{D}" filter="url(#dust)" opacity="0.55"/></g>' if full else '')
            + f'<circle cx="50" cy="50" r="45" fill="none" stroke="{A}" stroke-width="{3.2 if full else 5}"/>'
            + stars + ell(A, sw)
            + f'<path d="{blob}" fill="{D}" stroke="{A}" stroke-width="{3 if full else 4.5}" stroke-linejoin="round"/>'
            + (f'<g stroke="{A}" stroke-width="1.6" stroke-linecap="round"><path d="M38 44 H55"/><path d="M41 50 H62"/><path d="M38 56 H50"/></g>' if full else '')
            + f'<g clip-path="url(#f)">{ell(D, sw + 3)}{ell(A, sw)}</g>'
            + f'<g transform="rotate(-18 50 50)"><rect x="{ax-3.4:.2f}" y="{ay-4.6:.2f}" width="6.8" height="9.2" fill="{A}" stroke="{D}" stroke-width="2"/></g>')
    front = '<clipPath id="disc"><circle cx="50" cy="50" r="44"/></clipPath><clipPath id="f"><rect x="0" y="50" width="100" height="60" transform="rotate(-18 50 50)"/></clipPath>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="DarkDatAgent"><defs>{dust}{front}</defs>{body}</svg>'
open('public/brand/darkdatagent-badge.svg', 'w').write(svg(True))
open('public/brand/darkdatagent-mark.svg', 'w').write(svg(False))
