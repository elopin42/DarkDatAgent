#!/usr/bin/env python3
"""Écrit public/renders/MANIFEST.md depuis zones.json et les fichiers WebP présents (dimensions lues dans l'en-tête).
   python3 tools/blender/manifest.py public/renders"""
import json, os, struct, sys

root = sys.argv[1]
Z = json.load(open(os.path.join(root, 'zones.json')))['zones']

def dims(p):
    b = open(p, 'rb').read(40)
    if b[12:16] == b'VP8X': return 1 + int.from_bytes(b[24:27], 'little'), 1 + int.from_bytes(b[27:30], 'little')
    if b[12:16] == b'VP8L':
        v = int.from_bytes(b[21:25], 'little'); return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
    if b[12:16] == b'VP8 ': w, h = struct.unpack('<HH', b[26:30]); return w & 0x3FFF, h & 0x3FFF
    return 0, 0

def table(sub):
    rows = []
    d = os.path.join(root, sub)
    if not os.path.isdir(d): return ''
    for dp, _, fs in sorted(os.walk(d)):
        for f in sorted(fs):
            if not f.endswith('.webp'): continue
            p = os.path.join(dp, f); w, h = dims(p)
            rows.append(f'| `{os.path.relpath(p, root)}` | {w} x {h} | {os.path.getsize(p) / 1024:.1f} KB |')
    return '| Fichier | Dimensions | Poids |\n|---|---|---|\n' + '\n'.join(rows) + '\n'

def tot(sub):
    s = 0
    for dp, _, fs in os.walk(os.path.join(root, sub)):
        s += sum(os.path.getsize(os.path.join(dp, f)) for f in fs if f.endswith('.webp'))
    return s / 1024

def r(v): return '[' + ', '.join(f'{x:g}' for x in v) + ']'
def half(v): return '[' + ', '.join(f'{x / 2:g}' for x in v) + ']'

b, row, m = Z.get('box', {}), Z.get('row', {}), Z.get('m24', {})
out = f"""# Rendus de la v2 (`public/renders/`)

Rendus Blender 5.2 (Cycles, RTX) par `tools/blender/v2_renders.py` : les boîtes à archives et l'Olivetti M24 de la
scène du sous-sol, mêmes modèles et mêmes matières CC0 que la passe 3D (Cardboard002, Paper002, Plastic013A,
Metal032), éclairage chaud et sobre, **fond transparent** avec ombre de contact douce (posés sur `#edebe7` ou
`#fbfaf7`). Chaque image existe en `@2x` (écrans Retina) et en 1x (moitié). Les coordonnées sont en pixels de
l'image `@2x`, origine en haut à gauche ; diviser par 2 pour la 1x (valeurs 1x données aussi). Vue de face,
légèrement plongeante (12° pour une boîte seule, 10° pour la rangée), en orthographique : les zones restent des
rectangles. Aucun texte n'est rendu dans l'image : les étiquettes et la feuille sont des zones laissées libres pour le
texte de la page (verbe, outil, état, résumé).

Couleurs des étiquettes : repos = papier, active = ambre allumé (petit écran ambre qui luit sur le dos, comme en
v1), terminée = encre (`#152127`, texte en `surface` par dessus), échec = rouge (`#ba2c25`).

## 1a. La boîte seule, quatre états (schéma de `/board/` et chaîne de la landing)

{table('box').split(chr(10) + '| `box/open')[0] if False else ''}"""
# tableau des états seuls
rows = ['| Fichier | Dimensions | Poids |', '|---|---|---|']
for st in ('rest', 'active', 'done', 'failed'):
    for suf in ('@2x', ''):
        p = os.path.join(root, 'box', f'box-{st}{suf}.webp')
        if os.path.exists(p):
            w, h = dims(p); rows.append(f'| `box/box-{st}{suf}.webp` | {w} x {h} | {os.path.getsize(p) / 1024:.1f} KB |')
out += '\n'.join(rows) + '\n\n'
if b:
    out += f"""Zones (`@2x`, image {b['size@2x'][0]} x {b['size@2x'][1]}) :
- étiquette (texte verbe, outil, état) : `{r(b['label@2x'])}` (x0, y0, x1, y1), soit en 1x `{half(b['label@2x'])}`
- dos de la boîte (face avant, du pied au haut du couvercle) : `{r(b['spine@2x'])}`, 1x `{half(b['spine@2x'])}`
- feuille qui dépasse (état terminé seulement) : `{r(b.get('sheet_done@2x', []))}`, 1x `{half(b.get('sheet_done@2x', []))}`

Les quatre images ont le même cadrage : passer de l'une à l'autre par fondu enchaîné (ou `opacity` sur des images
superposées) ne bouge rien. La boîte qui « sort » de 34 px reste une translation CSS de l'image entière.

"""
out += f"""## 1b. Séquences : la boîte qui s'ouvre et s'allume, la boîte qui termine

- `box/open/box-open-00..23` : 24 images. Le couvercle se lève (26° au plus) puis se repose, l'étiquette s'allume.
  Image 0 = `box-rest` à l'étiquette près (éteinte), image 23 = `box-active`.
- `box/done/box-done-00..15` : 16 images. Le couvercle s'entrouvre, la feuille sort par le haut, l'étiquette passe
  de l'ambre à l'encre. Image 0 = `box-active`, image 15 = `box-done`.
- `box/box-open-strip(@2x).webp` et `box/box-done-strip(@2x).webp` : les mêmes images en une bande horizontale
  (une requête), à piloter par `background-position` ou par un `drawImage` sur canvas avec GSAP (image k à
  x = k x largeur d'une image). Largeur d'une image : 144 px en 1x, 288 px en `@2x`.
- Suggestion de pilotage : 24 images sur 0,9 s (`steps(23)` ou une tween GSAP sur un index arrondi), jamais en boucle.
  Mouvement réduit : afficher directement l'image finale.

Poids : ouverture {tot('box/open'):.0f} KB (images séparées, 1x et 2x), terminé {tot('box/done'):.0f} KB.

## 1c. La rangée de 24 boîtes (section problème)

"""
rows = ['| Fichier | Dimensions | Poids |', '|---|---|---|']
for f in sorted(os.listdir(os.path.join(root, 'row'))) if os.path.isdir(os.path.join(root, 'row')) else []:
    p = os.path.join(root, 'row', f); w, h = dims(p); rows.append(f'| `row/{f}` | {w} x {h} | {os.path.getsize(p) / 1024:.1f} KB |')
out += '\n'.join(rows) + '\n\n'
if row:
    out += f"""Deux images au cadrage identique : `row-amber` (24 étiquettes ambre allumées) et `row-grey` (24 étiquettes
éteintes, papier gris). Pour éteindre les boîtes une à une, superposer `row-grey` sur `row-amber` et découvrir
chaque boîte par un `clip-path: inset()` sur sa colonne (ou 24 masques). Colonnes des boîtes en x (`@2x`, image
{row['size@2x'][0]} x {row['size@2x'][1]}), de gauche à droite :

`{json.dumps([[round(a, 1) for a in x] for x in row['boxes_x@2x']])}`

Étiquettes (x0, y0, x1, y1, `@2x`) :

`{json.dumps([[round(a, 1) for a in x] for x in row['labels@2x']])}`

"""
out += """## 2. L'Olivetti M24, de face, l'écran laissé libre (« The same task, five years apart », vidéo de 2021)

"""
rows = ['| Fichier | Dimensions | Poids | Usage |', '|---|---|---|---|']
use = {'m24-front': 'le poste, **écran transparent** : poser la vidéo dessous, le cadre la recouvre',
       'm24-glass': 'le verre seul (reflets du softbox, bombé) : à poser **par dessus** la vidéo',
       'm24-off': 'repli (sans vidéo, mouvement réduit) : écran éteint, verre sombre',
       'm24-34-tutorial': 'trois quarts, image clé 35 de 2021 sur l\'écran : visuel fixe pour évoquer le tutoriel',
       'm24-34-front': 'trois quarts, écran transparent (vidéo dessous, calée par matrix3d sur les coins)'}
for f in sorted(os.listdir(os.path.join(root, 'm24'))) if os.path.isdir(os.path.join(root, 'm24')) else []:
    p = os.path.join(root, 'm24', f); w, h = dims(p)
    rows.append(f"| `m24/{f}` | {w} x {h} | {os.path.getsize(p) / 1024:.1f} KB | {use.get(f.replace('@2x', '').replace('.webp', ''), '')} |")
out += '\n'.join(rows) + '\n\n'
if m:
    out += f"""Écran (`@2x`, image {m['size@2x'][0]} x {m['size@2x'][1]}) : l'axe de la caméra est perpendiculaire à l'écran, il se
projette en rectangle.
- rectangle de l'écran (bord du verre) : `{r(m['screen@2x'])}`, 1x `{half(m['screen@2x'])}`
- coins (haut gauche, haut droit, bas droit, bas gauche) : `{json.dumps(m['screen_corners@2x'])}`
- partie visible dans l'ouverture du cadre : `{r(m['screen_visible@2x'])}`, 1x `{half(m['screen_visible@2x'])}`

Montage conseillé : un conteneur en `position: relative` à la taille de l'image ; la `<video>` (640 x 400, 16:10) en
`position: absolute` sur le rectangle de l'écran, `object-fit: cover`, avec le léger filtre CRT de la page (trame,
lueur) ; `m24-front` par dessus (son écran est transparent, son cadre masque les bords de la vidéo) ; `m24-glass`
encore par dessus, en `mix-blend-mode: screen`, opacité 0,6 à 1. Les pourcentages (x / largeur, y / hauteur) restent
valables à toute taille d'affichage.

"""
m34 = Z.get('m24_34')
if m34:
    out += f"""Trois quarts (`m24-34-*`, image {m34['size@2x'][0]} x {m34['size@2x'][1]}) : l'écran est un quadrilatère. Coins `@2x` (haut gauche,
haut droit, bas droit, bas gauche) : `{json.dumps(m34['screen_corners@2x'])}`. Pour une vidéo dessous, un `matrix3d`
calculé depuis ces quatre coins ; plus simple : `m24-34-tutorial` en image fixe.

"""
out += f"""## Budget

Total des rendus : {tot(''):.0f} KB (1x et 2x). Une page ne charge que ce qu'elle montre : la landing, `box-*` 1x ou 2x
selon la densité (`srcset`), une bande de séquence et la rangée ; `/board/`, les quatre états et les deux bandes.
WebP qualité 82 à 90, alpha conservé. Images de contrôle sur le fond du site : `design/checks/soussol-v2-renders/`.
"""
open(os.path.join(root, 'MANIFEST.md'), 'w').write(out)
print('MANIFEST ok', round(tot('')), 'KB')
