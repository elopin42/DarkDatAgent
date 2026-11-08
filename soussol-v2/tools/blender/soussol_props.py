# Le sous-sol, passe 3D (Blender sans interface, Cycles sur la RTX).
# Sorties dans out/ :
#   soussol_props.glb   bureau Synthesis 45, Olivetti M24 (unité, lecteurs, moniteur, clavier type 1 à 83 touches),
#                       Tizio, soupirail. Repère three (y en haut), un maillage par matière, UV0 en mètres (matières
#                       en mosaïque), UV1 unique (AO et lumière indirecte précalculées).
#   props_ao.png        occlusion ambiante de ces objets (UV1), 2048
#   props_ind.png       lumière indirecte de ces objets (UV1), 2048, encodée sRGB, échelle dans bake.json
#   floor_ao.png, floor_ind.png   sol de l'allée (plan 6 x 9 m, UV du PlaneGeometry de three)
#   wall_ao.png, wall_ind.png     mur du fond, x -3..3, y 0..2,7
#   box_*.png           atlas des dos de boîtes à archives (étiquette, trou de préhension), couleur, normale, rugosité
#   upright_*.png       montants perforés des rayonnages (alpha des trous), couleur, normale
#   tex_*.png           matières CC0 recadrées (plâtre peint, béton, plastique, métal peint)
#   preview.png         rendu de contrôle depuis la caméra de départ
#   bake.json           échelles d'encodage
# Repère : three (x, y, z) devient Blender (x, -z, y) ; l'export glTF en y haut rend les coordonnées three.
import bpy, bmesh, math, os, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion

OUT = os.path.abspath('out')
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); print('[props]', s); LOG.append(s)

def T(x, y, z):
    return Vector((x, -z, y))

def srgb(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1]

MATS = {}
def mat(name, hexc, rough=0.6, metal=0.0, emit=None, strength=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexc)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit is not None:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = strength
    MATS[name] = m
    return m

DESK_Y = 0.72; TOP = DESK_Y + 0.03; SY, SZ = 1.052, 0.047

M = dict(
    deskTop=mat('deskTop', 0x8d8e8a, 0.42, 0.1), abs=mat('abs', 0x2a2c2d, 0.5), m24=mat('m24', 0xd6d2c8, 0.45),
    m24dark=mat('m24dark', 0x3a3b3a, 0.55), keyL=mat('keyL', 0xd2cdc2, 0.5), keyD=mat('keyD', 0x6e6d69, 0.55),
    drive=mat('drive', 0x1c1d1d, 0.5), crt=mat('crt', 0x0b0c0c, 0.25), lamp=mat('lamp', 0x111213, 0.38, 0.2),
    lampMetal=mat('lampMetal', 0x9a9a98, 0.3, 1.0), steelDark=mat('steelDark', 0x2b3133, 0.5, 0.6),
    plaster=mat('plaster', 0x1a2a2f, 0.95), red=mat('red', 0x7a1a14, 0.5),
    bulb=mat('bulb', 0xfff1d6, 0.3, 0, 0xfff1d6, 6.0),
)
PROPS = []   # objets exportés et cuits

def link(name, bm, m, mods=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    me.materials.append(m)
    if mods:
        for p in me.polygons: p.use_smooth = True
        mods(o); o['bev'] = 1
    PROPS.append(o)
    return o

def bevel_mod(r, seg=3, angle=40):
    def f(o):
        b = o.modifiers.new('bev', 'BEVEL'); b.width = r; b.segments = seg; b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle); b.use_clamp_overlap = True
        try: b.harden_normals = True
        except Exception: pass
    return f

def xform(bm, mat4):
    bmesh.ops.transform(bm, matrix=mat4, verts=bm.verts[:])

def rbox(name, c, s, m, r=0.0, seg=3, taper=None, top_shift=None, rot=None):
    """boîte en coordonnées three : centre c, tailles s = (x, y, z) ; taper = (fx, fz) réduit la face du haut ;
    rot = matrice 3x3 Blender appliquée avant translation."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * s[0], v.co.y * s[2], v.co.z * s[1]))
        if taper and v.co.z > 0:
            v.co.x *= taper[0]; v.co.y *= taper[1]
        if top_shift and v.co.z > 0:
            v.co.y -= top_shift  # recul de la face du haut vers l'arrière (y Blender = -z three)
    if rot is not None: xform(bm, rot.to_4x4())
    xform(bm, Matrix.Translation(T(*c)))
    rr = min(r, min(s) * 0.45)
    return link(name, bm, m, bevel_mod(rr, seg) if rr > 0 else None)

def cyl(name, c, r1, r2, h, m, seg=32, axis=None, bev=0.0):
    """cylindre d'axe y three (z Blender), ou d'axe donné (vecteur three)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    if axis is not None:
        a = T(*axis).normalized()
        q = Vector((0, 0, 1)).rotation_difference(a)
        xform(bm, q.to_matrix().to_4x4())
    xform(bm, Matrix.Translation(T(*c)))
    return link(name, bm, m, bevel_mod(bev, 2, 50) if bev > 0 else None)

def bar(name, a, b, w, t, m, side, r=0.0015):
    """barre plate de a à b (three), section w (dans le plan, perpendiculaire) x t (selon side, normale du plan)"""
    A, B = T(*a), T(*b); d = (B - A); L = d.length; d.normalize()
    n = T(*side).normalized(); u = n.cross(d).normalized()
    R = Matrix((d, u, n)).transposed()
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * L, v.co.y * w, v.co.z * t))
    xform(bm, R.to_4x4()); xform(bm, Matrix.Translation((A + B) / 2))
    return link(name, bm, m, bevel_mod(r, 2) if r > 0 else None)

# ---------------------------------------------------------------- bureau Synthesis 45 et caisson
rbox('desk_frame', (0, DESK_Y + 0.0135, 0), (1.6, 0.027, 0.8), M['abs'], r=0.012, seg=4)
rbox('desk_top', (0, TOP - 0.003, 0), (1.55, 0.006, 0.75), M['deskTop'], r=0.002, seg=2)
rbox('desk_side', (-0.76, DESK_Y / 2, 0), (0.03, DESK_Y, 0.72), M['abs'], r=0.008)
rbox('desk_foot', (-0.76, 0.0125, 0), (0.06, 0.025, 0.74), M['abs'], r=0.01)
rbox('desk_modesty', (0, DESK_Y - 0.2, -0.36), (1.5, 0.36, 0.02), M['abs'], r=0.006)
rbox('ped_body', (0.56, 0.36, -0.005), (0.42, 0.66, 0.69), M['deskTop'], r=0.008)
rbox('ped_plinth', (0.56, 0.03, -0.01), (0.4, 0.06, 0.66), M['abs'], r=0.006)
for k in range(3):
    h = 0.2027; y0 = 0.065 + k * (h + 0.006)
    rbox('ped_front%d' % k, (0.56, y0 + h / 2, 0.343), (0.41, h, 0.018), M['deskTop'], r=0.005)
    rbox('ped_pull%d' % k, (0.56, y0 + h - 0.022, 0.354), (0.17, 0.018, 0.012), M['abs'], r=0.005)

# ---------------------------------------------------------------- Olivetti M24 : unité centrale
UZ = -0.12; UF = UZ + 0.19   # face avant à z = 0.07
rbox('unit_base', (0, TOP + 0.0175, UZ), (0.4, 0.035, 0.38), M['m24'], r=0.006)
rbox('unit_cover', (0, TOP + 0.0835, UZ), (0.4, 0.093, 0.38), M['m24'], r=0.008, seg=4)
rbox('unit_seam', (0, TOP + 0.036, UZ), (0.394, 0.003, 0.374), M['m24dark'])
for k, y in enumerate((TOP + 0.059, TOP + 0.101)):
    rbox('drive%d' % k, (0.09, y, UF + 0.001), (0.165, 0.036, 0.006), M['drive'], r=0.002, seg=2)
    rbox('drive_slot%d' % k, (0.08, y + 0.004, UF + 0.0042), (0.118, 0.0035, 0.002), M['crt'])
    rbox('drive_lever%d' % k, (0.152, y, UF + 0.006), (0.012, 0.03, 0.008), M['keyL'], r=0.002, seg=2)
    rbox('drive_led%d' % k, (0.02, y - 0.011, UF + 0.0042), (0.006, 0.003, 0.002), M['red'])
for k in range(14):   # grille d'aération en façade, à gauche
    rbox('vent%d' % k, (-0.175 + k * 0.0085, TOP + 0.062, UF + 0.0005), (0.0035, 0.034, 0.003), M['drive'])
rbox('unit_badge', (-0.12, TOP + 0.104, UF + 0.0005), (0.095, 0.011, 0.003), M['m24dark'], r=0.001, seg=1)
rbox('unit_power', (-0.03, TOP + 0.104, UF + 0.0015), (0.016, 0.011, 0.006), M['m24dark'], r=0.002, seg=2)
# pied orientable
cyl('foot', (0, TOP + 0.139, -0.1), 0.085, 0.07, 0.018, M['m24dark'], bev=0.003)
cyl('neck', (0, TOP + 0.16, -0.1), 0.045, 0.04, 0.03, M['m24dark'], bev=0.002)

# ---------------------------------------------------------------- moniteur 12 pouces
BZ = 0.031  # centre du cadre (face avant à 0.056)
bez = rbox('bezel', (0, SY, BZ), (0.36, 0.30, 0.05), M['m24'], r=0.0)
# ouverture évasée par un booléen, puis biseau
cut_bm = bmesh.new(); bmesh.ops.create_cube(cut_bm, size=1.0)
for v in cut_bm.verts:
    front = v.co.y < 0  # y Blender négatif = z three positif = avant
    w, h = (0.292, 0.19) if front else (0.262, 0.162)
    v.co = Vector((v.co.x * w, (-0.03 if front else 0.0), v.co.z * h))
xform(cut_bm, Matrix.Translation(T(0, SY, BZ + 0.025 - 0.012)))
me = bpy.data.meshes.new('cut'); cut_bm.to_mesh(me); cut_bm.free()
me.materials.append(M['m24'])
cutter = bpy.data.objects.new('cut', me); scene.collection.objects.link(cutter)
# l'arrière de l'ouverture traverse tout le cadre
for v in cutter.data.vertices:
    if v.co.y > T(0, SY, BZ + 0.013).y - 1e-5: v.co.y = T(0, SY, BZ - 0.05).y
bo = bez.modifiers.new('bool', 'BOOLEAN'); bo.operation = 'DIFFERENCE'; bo.object = cutter
try: bo.solver = 'EXACT'
except Exception: pass
bevel_mod(0.012, 4)(bez)
cutter.hide_render = True; cutter.hide_viewport = True
rbox('crt_surround', (0, SY, 0.04), (0.30, 0.20, 0.01), M['crt'], r=0.004, seg=2)
# coque arrière, en tronc de pyramide
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    back = v.co.y > 0
    w, h = (0.24, 0.19) if back else (0.335, 0.285)
    v.co = Vector((v.co.x * w, v.co.y * 0.26, v.co.z * h + (0.03 if back else 0.0)))
xform(bm, Matrix.Translation(T(0, SY, BZ - 0.025 - 0.13 + 0.002)))
link('hood', bm, M['m24'], bevel_mod(0.016, 4))
for k in range(11):   # fentes d'aération sur le dessus de la coque
    rbox('hood_vent%d' % k, (-0.1 + k * 0.02, SY + 0.1345, -0.12), (0.006, 0.004, 0.11), M['drive'],
         rot=Matrix.Rotation(-math.atan2(0.0175, 0.26), 3, 'X'))
for k, x in enumerate((0.118, 0.142)):
    cyl('knob%d' % k, (x, SY - 0.128, 0.058), 0.0075, 0.007, 0.009, M['m24dark'], seg=20, axis=(0, 0, 1), bev=0.0012)
rbox('mon_badge', (-0.125, SY - 0.128, 0.0565), (0.05, 0.008, 0.002), M['m24dark'])

# ---------------------------------------------------------------- clavier type 1, 83 touches (disposition XT)
KZ0, KZ1 = 0.16, 0.34; HB, HF = 0.032, 0.018
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    v.co = Vector((v.co.x * 0.46, v.co.y * (KZ1 - KZ0), (v.co.z + 0.5)))
    zt = -v.co.y + (KZ0 + KZ1) / 2  # z three
    if v.co.z > 0.5: v.co.z = HB + (HF - HB) * (zt - KZ0) / (KZ1 - KZ0)
    else: v.co.z = 0.0
xform(bm, Matrix.Translation(T(0, TOP, (KZ0 + KZ1) / 2)))
link('kb_case', bm, M['m24'], bevel_mod(0.005, 3))
slope = math.atan2(HB - HF, KZ1 - KZ0)
def kb_y(z): return TOP + HB + (HF - HB) * (z - KZ0) / (KZ1 - KZ0)
U = 0.0188
rows_main = [
    [1] * 13 + [2],
    [1.5] + [1] * 12 + [1.5],
    [1.75] + [1] * 12,
    [1.25, 1] + [1] * 10 + [1.75, 1],
    [1.5, 9, 1.5],
]
dark_main = [{0, 13}, {0, 13}, {0}, {0, 12, 13}, {0, 2}]
keys = []  # (x, z, w, d, dark)
z0 = 0.205
for r in range(5):
    keys.append((-0.215, z0 + r * U, 1, 1, True)); keys.append((-0.215 + U, z0 + r * U, 1, 1, True))
x0 = -0.215 + 2 * U + 0.008
for r, row in enumerate(rows_main):
    x = x0
    for i, w in enumerate(row):
        dd = 1
        if r == 1 and i == len(row) - 1: dd = 2   # Entrée sur deux rangs
        zc = z0 + r * U + (dd - 1) * U / 2
        keys.append((x + w * U / 2 - U / 2, zc, w, dd, i in dark_main[r]))
        x += w * U
xp = x0 + 15 * U + 0.008
pad = [[(0, 2), (2, 2)], [(0, 1), (1, 1), (2, 1), (3, 1)], [(0, 1), (1, 1), (2, 1), (3, 1, 2)], [(0, 1), (1, 1), (2, 1)], [(0, 2), (2, 1)]]
for r, row in enumerate(pad):
    for it in row:
        c, w = it[0], it[1]; dd = it[2] if len(it) > 2 else 1
        keys.append((xp + c * U + w * U / 2 - U / 2, z0 + r * U + (dd - 1) * U / 2, w, dd, True))
log('touches', len(keys))
rot = Matrix.Rotation(slope, 3, 'X')
for i, (x, z, w, dd, dark) in enumerate(keys):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bw, bd, kh = w * U - 0.0032, dd * U - 0.0032, 0.0105
    for v in bm.verts:
        top = v.co.z > 0
        ix = 0.0024 if top else 0.0
        v.co = Vector((v.co.x * (bw - 2 * ix), v.co.y * (bd - 2 * ix) + (0.0012 if top else 0.0), (v.co.z + 0.5) * kh))
    xform(bm, rot.to_4x4())
    xform(bm, Matrix.Translation(T(x, kb_y(z) - 0.004, z)))
    link('key%d' % i, bm, M['keyD'] if dark else M['keyL'], bevel_mod(0.0012, 2, 30))

# ---------------------------------------------------------------- Tizio (Richard Sapper, Artemide, 1972)
LB = Vector((-0.6, TOP, -0.22))
cyl('t_base', (LB.x, LB.y + 0.017, LB.z), 0.058, 0.056, 0.034, M['lamp'], seg=48, bev=0.005)
rbox('t_switch', (LB.x + 0.03, LB.y + 0.0355, LB.z + 0.012), (0.014, 0.004, 0.02), M['m24dark'], r=0.0015, seg=2)
P0 = Vector((LB.x, LB.y + 0.19, LB.z))
cyl('t_stem', (LB.x, LB.y + 0.034 + 0.078, LB.z), 0.0065, 0.0065, 0.156, M['lamp'], seg=16)
cyl('t_turn', (LB.x, LB.y + 0.04, LB.z), 0.016, 0.016, 0.012, M['lamp'], seg=24, bev=0.002)
P1 = Vector((-0.5, TOP + 0.55, -0.27))
HEAD = Vector((-0.2, TOP + 0.5, -0.02))
def horiz_perp(d):
    n = Vector((d.z, 0, -d.x)); return n.normalized()
d1 = P1 - P0; n1 = horiz_perp(d1)
CW1 = P0 - 0.36 * d1
d2 = HEAD - P1; n2 = horiz_perp(d2)
CW2 = P1 - 0.34 * d2
def boom(name, a, b, n, sep=0.0075):
    d = (b - a).normalized(); perp = n.cross(d).normalized()   # dans le plan vertical du bras
    for s in (-1, 1):
        off = perp * sep * s
        bar('%s%d' % (name, s), tuple(a + off), tuple(b + off), 0.0075, 0.0055, M['lamp'], tuple(n))
boom('t_lower', CW1, P1 + d1.normalized() * 0.012, n1)
boom('t_upper', CW2, HEAD, n2, sep=0.006)
rbox('t_fork', tuple(P0), (0.02, 0.026, 0.02), M['lamp'], r=0.003, seg=2)
for name, p, n, r in (('t_pin0', P0, n1, 0.0055), ('t_pin1', P1, n2, 0.0075)):
    cyl(name, tuple(p), r, r, 0.03, M['lampMetal'], seg=16, axis=tuple(n), bev=0.001)
cyl('t_cw1', tuple(CW1), 0.019, 0.019, 0.034, M['lamp'], seg=32, axis=tuple(n1), bev=0.003)
cyl('t_cw2', tuple(CW2), 0.0155, 0.0155, 0.03, M['lamp'], seg=32, axis=tuple(n2), bev=0.003)
# tête : coque effilée dans l'axe du bras, inclinée vers le bureau, avec son ailette de refroidissement
dh = Vector((d2.x, 0, d2.z)).normalized()
yaw = math.atan2(dh.x, dh.z)  # angle autour de y three
Rh = (Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(math.radians(14), 3, 'X'))
HC = HEAD + dh * 0.022
rbox('t_head', tuple(HC), (0.036, 0.026, 0.08), M['lamp'], r=0.008, seg=3, taper=(0.8, 0.85), rot=Rh)
rbox('t_fin', tuple(HC + Vector((0, 0.019, 0)) - dh * 0.006), (0.004, 0.012, 0.06), M['lamp'], r=0.0015, seg=2, rot=Rh)
rbox('t_bulb', tuple(HC + dh * 0.014 + Vector((0, -0.0135, 0))), (0.024, 0.002, 0.034), M['bulb'], rot=Rh)
log('tizio CW1', tuple(round(v, 3) for v in CW1), 'CW2', tuple(round(v, 3) for v in CW2), 'HC', tuple(round(v, 3) for v in HC))

# ---------------------------------------------------------------- soupirail : embrasure, appui incliné, châssis, barreaux
WX, WY, WZ = -0.75, 2.47, -0.75
for name, c, s in (
    ('sp_top', (WX, WY + 0.15, WZ + 0.06), (1.0, 0.06, 0.12)),
    ('sp_l', (WX - 0.47, WY, WZ + 0.06), (0.06, 0.36, 0.12)),
    ('sp_r', (WX + 0.47, WY, WZ + 0.06), (0.06, 0.36, 0.12)),
):
    rbox(name, c, s, M['plaster'], r=0.01)
rbox('sp_sill', (WX, WY - 0.15, WZ + 0.075), (1.0, 0.06, 0.15), M['plaster'], r=0.01, top_shift=0.0,
     rot=Matrix.Rotation(math.radians(18), 3, 'X'))
for name, c, s in (
    ('sp_fr_t', (WX, WY + 0.112, WZ + 0.02), (0.88, 0.024, 0.03)),
    ('sp_fr_b', (WX, WY - 0.112, WZ + 0.02), (0.88, 0.024, 0.03)),
    ('sp_fr_l', (WX - 0.428, WY, WZ + 0.02), (0.024, 0.24, 0.03)),
    ('sp_fr_r', (WX + 0.428, WY, WZ + 0.02), (0.024, 0.24, 0.03)),
    ('sp_fr_m', (WX, WY, WZ + 0.02), (0.02, 0.24, 0.026)),
):
    rbox(name, c, s, M['steelDark'], r=0.003, seg=2)
for k in range(5):
    cyl('sp_bar%d' % k, (WX - 0.3 + k * 0.15, WY, WZ + 0.075), 0.0075, 0.0075, 0.27, M['steelDark'], seg=12)

# ---------------------------------------------------------------- figer les modificateurs, UV0 en mètres
dg = bpy.context.evaluated_depsgraph_get()
for o in PROPS:
    if not o.modifiers: continue
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)
bpy.data.objects.remove(cutter, do_unlink=True)

def sharpen(o):
    me = o.data
    for p in me.polygons: p.use_smooth = True
    if o.get('bev'): return
    bm = bmesh.new(); bm.from_mesh(me)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(40): e.smooth = False
    bm.to_mesh(me); bm.free()
for o in PROPS: sharpen(o)

def box_uv(o):
    me = o.data
    uv0 = me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='UVMap')
    uv0.name = 'UVMap'
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0: u, v = co.y, co.z
            elif ax == 1: u, v = co.x, co.z
            else: u, v = co.x, co.y
            uv0.data[li].uv = (u, v)
    if 'lm' not in me.uv_layers: me.uv_layers.new(name='lm')
for o in PROPS: box_uv(o)

# joindre par matière
bpy.ops.object.select_all(action='DESELECT')
groups = {}
for o in PROPS: groups.setdefault(o.data.materials[0].name, []).append(o)
FINAL = []
for name, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = 'p_' + name; j.data.name = 'p_' + name
    FINAL.append(j)
tris = sum(len(o.data.polygons) for o in FINAL)
log('maillages', len(FINAL), 'faces', tris)

# UV1 : dépliage unique pour tous les objets, emballé dans un seul carré
bpy.ops.object.select_all(action='DESELECT')
for o in FINAL:
    o.select_set(True); o.data.uv_layers.active = o.data.uv_layers['lm']
bpy.context.view_layer.objects.active = FINAL[0]
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
try: bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
except TypeError: bpy.ops.uv.pack_islands(margin=0.003)
bpy.ops.object.mode_set(mode='OBJECT')
for o in FINAL: o.data.uv_layers.active = o.data.uv_layers['UVMap']

# ---------------------------------------------------------------- contexte de cuisson : pièce, rayonnages proches, lumières
floorm = mat('floor', 0x1d2629, 0.85); wallm = mat('wallc', 0x1a2a2f, 0.95)
steel = mat('steel', 0x5d676a, 0.55, 0.5)
cart = [mat('c%d' % i, h, 0.92) for i, h in enumerate([0x8a7e69, 0x7d725f, 0x968a73, 0x6f6656])]
screenm = mat('screen', 0x140b04, 0.3, 0, 0xffa640, 2.2)
winm = mat('win', 0x5f7f8a, 0.5, 0, 0x9cc4d4, 3.0)
CTX = []
def cbox(name, c, s, m):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * s[0], v.co.y * s[2], v.co.z * s[1]))
    xform(bm, Matrix.Translation(T(*c)))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); CTX.append(o); return o

def plane_uv(name, corners, uvs, m, res):
    me = bpy.data.meshes.new(name)
    me.from_pydata([T(*c) for c in corners], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UVMap')
    for i, l in enumerate(me.loops): uv.data[i].uv = uvs[l.vertex_index]
    me.materials.append(m)
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    # subdivision pour un éclairage de cuisson régulier (pas nécessaire en Cycles, mais sans coût)
    return o
# sol de l'allée : PlaneGeometry(6, 9) tourné de -90° en x, centré en (0, 0, 3.75) : u = (x+3)/6, v = (8.25-z)/9
floor = plane_uv('bake_floor', [(-3, 0, 8.25), (3, 0, 8.25), (3, 0, -0.75), (-3, 0, -0.75)], [(0, 0), (1, 0), (1, 1), (0, 1)], floorm, None)
wall = plane_uv('bake_wall', [(-3, 0, -0.75), (3, 0, -0.75), (3, 2.7, -0.75), (-3, 2.7, -0.75)], [(0, 0), (1, 0), (1, 1), (0, 1)], wallm, None)
cbox('floor_far', (0, -0.011, 5), (30, 0.02, 30), floorm)
cbox('wall_far', (0, 2, -0.775), (30, 4, 0.02), wallm)
cbox('ceil', (0, 2.71, 5), (30, 0.02, 30), wallm)
cbox('window', (WX, WY, WZ + 0.005), (0.84, 0.22, 0.005), winm)
cbox('screen', (0, SY, SZ - 0.002), (0.272, 0.17, 0.004), screenm)

def mulberry(a):
    st = [a & 0xffffffff]
    def imul(x, y): return ((x & 0xffffffff) * (y & 0xffffffff)) & 0xffffffff
    def r():
        st[0] = (st[0] + 0x6d2b79f5) & 0xffffffff
        a = st[0]
        t = imul(a ^ (a >> 15), 1 | a)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xffffffff) ^ t
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return r
rng = mulberry(713)
SHELVES = [0.08, 0.5, 0.92, 1.34, 1.76]
def rack(x, z0, z1, face, fill=0.92, build=True):
    depth = 0.42
    z = z0
    while z <= z1 + 1e-3:
        if build:
            cbox('up', (x - face * depth / 2, 1.0, z), (0.03, 2.0, 0.03), steel)
            cbox('up', (x + face * depth / 2, 1.0, z), (0.03, 2.0, 0.03), steel)
        z += 1
    if build:
        for y in SHELVES: cbox('shelf', (x, y, (z0 + z1) / 2), (depth, 0.015, z1 - z0), steel)
    for y in SHELVES:
        zz = z0 + 0.04
        while zz < z1 - 0.1:
            if rng() > fill: zz += 0.1; continue
            h = 0.33 if rng() < 0.7 else 0.25
            ci = int(rng() * 4); rng()
            if build: cbox('b', (x + face * 0.04, y + 0.008 + h / 2, zz + 0.05), (0.3, h, 0.094), cart[ci])
            zz += 0.1
rack(-1.15, -0.65, 1.55, 1); rack(1.15, -0.65, 1.55, -1)
rack(-1.15, 2.65, 5.65, 1); rack(1.15, 2.65, 5.65, -1)
for k in range(1, 3):
    rack(-1.15 - k * 1.1, -0.65, 5.65, 1, 0.85); rack(1.15 + k * 1.1, -0.65, 5.65, -1, 0.85)

def spot(name, pos, target, color, power, angle, blend, soft=0.02):
    d = bpy.data.lights.new(name, 'SPOT'); d.energy = power; d.color = srgb(color)[:3]; d.spot_size = angle * 2; d.spot_blend = blend
    d.shadow_soft_size = soft
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = T(*pos)
    o.rotation_euler = (T(*target) - T(*pos)).to_track_quat('-Z', 'Y').to_euler()
spot('tizio', (HEAD.x, HEAD.y - 0.02, HEAD.z), (-0.05, TOP, 0.12), 0xffd3a0, 18, 0.78, 0.65)
spot('cold', (-0.75, 2.4, -0.7), (-0.2, 0, 1.4), 0x9cc4d4, 40, 0.5, 0.9, 0.2)
p = bpy.data.lights.new('aisle', 'POINT'); p.energy = 25; p.color = srgb(0x5c7c86)[:3]; p.shadow_soft_size = 0.3
po = bpy.data.objects.new('aisle', p); scene.collection.objects.link(po); po.location = T(0, 2.3, 2.1)
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb(0x0a1b20)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

# ---------------------------------------------------------------- cuissons
def to_np(img):
    a = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32); img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)

def write_png(name, arr, w, h):
    """arr : float 0..1, (h, w, 4), écrit tel quel (Non-Color)"""
    im = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    im.filepath_raw = os.path.join(OUT, name + '.png'); im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)

def enc_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def bake(objs, w, h, kind, samples):
    img = bpy.data.images.new('bk', w, h, float_buffer=True)
    nodes = []
    for o in objs:
        for m in o.data.materials:
            if m is None: continue
            t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; m.node_tree.nodes.active = t; nodes.append((m, t))
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.cycles.samples = samples
    scene.render.bake.margin = 8
    if kind == 'AO':
        scene.render.bake.use_pass_direct = True
        bpy.ops.object.bake(type='AO', margin=8)
    else:
        scene.render.bake.use_pass_direct = False; scene.render.bake.use_pass_indirect = True; scene.render.bake.use_pass_color = False
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'INDIRECT'}, margin=8)
    a = to_np(img)
    for m, t in nodes: m.node_tree.nodes.remove(t)
    bpy.data.images.remove(img)
    return a

def set_lm_active(objs):
    for o in objs:
        if 'lm' in o.data.uv_layers: o.data.uv_layers.active = o.data.uv_layers['lm']

scales = {}
def bake_set(label, objs, w, h, uv_lm):
    if uv_lm: set_lm_active(objs)
    scene.world.light_settings.distance = 0.35
    ao = bake(objs, w, h, 'AO', 128)
    a = ao.copy(); a[..., 3] = 1
    write_png(label + '_ao', a, w, h)
    ind = bake(objs, w, h, 'IND', 384)
    rgb = ind[..., :3]
    p99 = float(np.percentile(rgb[rgb.sum(-1) > 1e-5].max(-1), 99.5)) if (rgb.sum(-1) > 1e-5).any() else 1.0
    k = 0.92 / max(p99, 1e-4)
    out = np.ones_like(ind); out[..., :3] = enc_srgb(rgb * k)
    write_png(label + '_ind', out, w, h)
    scales[label] = {'encode': k, 'p99': p99}
    if uv_lm:
        for o in objs: o.data.uv_layers.active = o.data.uv_layers['UVMap']
    log('cuisson', label, w, h, 'p99', round(p99, 4))

bake_set('props', FINAL, 2048, 2048, True)
bake_set('floor', [floor], 1024, 1536, False)
bake_set('wall', [wall], 1024, 512, False)

# ---------------------------------------------------------------- export GLB (props seuls)
bpy.ops.object.select_all(action='DESELECT')
for o in FINAL: o.select_set(True)
bpy.context.view_layer.objects.active = FINAL[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'soussol_props.glb'), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_extras=False)
log('glb', os.path.getsize(os.path.join(OUT, 'soussol_props.glb')))

# ---------------------------------------------------------------- textures
def load(name, noncolor=True):
    im = bpy.data.images.load(os.path.abspath(name))
    if noncolor: im.colorspace_settings.name = 'Non-Color'
    return im

def resized(name, size):
    im = load(name)
    if im.size[0] != size[0] or im.size[1] != size[1]: im.scale(size[0], size[1])
    a = to_np(im); bpy.data.images.remove(im); return a

def save_tex(src, out, size):
    a = resized(src, size); a[..., 3] = 1; write_png(out, a, size[0], size[1])

for src, out, size in (
    ('painted_plaster_wall_diff_1k.jpg', 'tex_plaster_col', (1024, 1024)),
    ('painted_plaster_wall_nor_gl_1k.jpg', 'tex_plaster_nor', (1024, 1024)),
    ('painted_plaster_wall_rough_1k.jpg', 'tex_plaster_rough', (512, 512)),
    ('concrete_floor_01_diff_1k.jpg', 'tex_concrete_col', (1024, 1024)),
    ('concrete_floor_01_nor_gl_1k.jpg', 'tex_concrete_nor', (1024, 1024)),
    ('concrete_floor_01_rough_1k.jpg', 'tex_concrete_rough', (512, 512)),
    ('Plastic013A_1K-JPG_NormalGL.jpg', 'tex_abs_nor', (512, 512)),
    ('Plastic013A_1K-JPG_Roughness.jpg', 'tex_abs_rough', (512, 512)),
    ('Plastic006_1K-JPG_NormalGL.jpg', 'tex_lacquer_nor', (512, 512)),
    ('Plastic006_1K-JPG_Roughness.jpg', 'tex_lacquer_rough', (512, 512)),
    ('Metal032_1K-JPG_NormalGL.jpg', 'tex_steel_nor', (512, 512)),
    ('Metal032_1K-JPG_Roughness.jpg', 'tex_steel_rough', (512, 512)),
):
    save_tex(src, out, size)

# atlas des boîtes : 512 x 1024, moitié gauche le dos (étiquette, trou), moitié droite le carton nu
W, H = 512, 1024
card = resized('Cardboard002_1K-JPG_Color.jpg', (W, H))
cardN = resized('Cardboard002_1K-JPG_NormalGL.jpg', (W, H))
cardR = resized('Cardboard002_1K-JPG_Roughness.jpg', (W, H))
paper = resized('Paper002_1K-JPG_Color.jpg', (W, H))
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
yy = (H - 1) - yy  # ligne 0 de Blender en bas : on travaille avec y vers le bas
hgt = np.zeros((H, W), np.float32)
col = card.copy(); rough = cardR[..., 0].copy()
# carton plus sombre et plus neutre (les boîtes d'archives grises-brunes), la teinte vient de l'instance
lum = col[..., :3].mean(-1, keepdims=True)
col[..., :3] = lum * 0.55 + col[..., :3] * 0.45
# étiquette : porte-étiquette imprimé, papier, au tiers haut du dos
lx0, lx1, ly0, ly1 = 34, 222, 120, 360
lab = (xx >= lx0) & (xx < lx1) & (yy >= ly0) & (yy < ly1)
col[lab, :3] = paper[lab, :3] * 1.05
rough[lab] = 0.8
hgt[lab] += 0.25
frame = ((xx >= lx0 - 10) & (xx < lx1 + 10) & (yy >= ly0 - 10) & (yy < ly1 + 10)) & ~lab
col[frame, :3] *= 0.45
# lignes réglées de l'étiquette (sans texte)
for k in range(4):
    ly = ly0 + 70 + k * 42
    ln = (xx >= lx0 + 16) & (xx < lx1 - 16) & (np.abs(yy - ly) < 1.2)
    col[ln, :3] *= 0.72
# trou de préhension
cx, cy, rr = 128, 640, 38
d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
hole = d < rr
ring = np.clip((rr + 7 - d) / 7, 0, 1) * (d >= rr)
hgt -= np.clip((rr + 6 - d) / 10, 0, 1) * 1.2
col[hole, :3] = 0.02
col[..., :3] *= (1 - 0.35 * ring)[..., None]
rough[hole] = 1.0
right = xx >= 256
col[right] = card[right]; col[right, :3] = col[right, :3].mean(-1, keepdims=True) * 0.55 + col[right, :3] * 0.45
hgt[right] = 0; rough[right] = cardR[right, 0]
# normales : celles du carton plus le relief dessiné
gy, gx = np.gradient(hgt)
n = cardN[..., :3] * 2 - 1
n[..., 0] += -gx * 0.6; n[..., 1] += -gy * 0.6
n /= np.linalg.norm(n, axis=-1, keepdims=True)
nrm = np.ones((H, W, 4), np.float32); nrm[..., :3] = n * 0.5 + 0.5
col[..., 3] = 1
rgh = np.ones((H, W, 4), np.float32); rgh[..., 0] = rgh[..., 1] = rgh[..., 2] = rough
# repasser en lignes Blender (bas en premier) : on a inversé yy, pas les tableaux, donc rien à faire
write_png('box_col', col, W, H); write_png('box_nor', nrm, W, H); write_png('box_rough', rgh, W, H)

# montant perforé : 64 x 512, fentes oblongues tous les 64 px, alpha pour les trous
W2, H2 = 64, 512
yy, xx = np.mgrid[0:H2, 0:W2].astype(np.float32)
alpha = np.ones((H2, W2), np.float32); h2 = np.zeros((H2, W2), np.float32)
for k in range(8):
    cy = 32 + k * 64
    dx = np.abs(xx - 32) / 7.0; dy = np.maximum(np.abs(yy - cy) - 14, 0) / 7.0
    dd = np.sqrt(dx ** 2 + dy ** 2)
    alpha[dd < 1] = 0
    h2 -= np.clip(1.6 - dd, 0, 0.6)
gy, gx = np.gradient(h2)
n2 = np.zeros((H2, W2, 3), np.float32); n2[..., 0] = -gx * 2.5; n2[..., 1] = -gy * 2.5; n2[..., 2] = 1
n2 /= np.linalg.norm(n2, axis=-1, keepdims=True)
steelc = resized('Metal032_1K-JPG_Color.jpg', (W2, H2))
uc = np.ones((H2, W2, 4), np.float32); uc[..., :3] = steelc[..., :3].mean(-1, keepdims=True) * 0.9; uc[..., 3] = alpha
un = np.ones((H2, W2, 4), np.float32); un[..., :3] = n2 * 0.5 + 0.5
write_png('upright_col', uc, W2, H2); write_png('upright_nor', un, W2, H2)

# ---------------------------------------------------------------- rendu de contrôle
cam = bpy.data.cameras.new('cam'); cam.sensor_fit = 'VERTICAL'; cam.angle = math.radians(38)
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
scene.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
for name, pos, look in (('preview', (0, 1.35, 3.6), (-0.25, 0.98, 0)), ('preview_close', (0, 1.12, 1.15), (0, SY, SZ))):
    co.location = T(*pos)
    co.rotation_euler = (T(*look) - T(*pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = 1440; scene.render.resolution_y = 900
    scene.cycles.samples = 96; scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)

json.dump({'scales': scales, 'log': LOG, 'blender': bpy.app.version_string}, open(os.path.join(OUT, 'bake.json'), 'w'), indent=2)
print('SOUSSOL PROPS OK')
