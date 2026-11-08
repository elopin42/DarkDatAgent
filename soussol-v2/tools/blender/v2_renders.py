# Rendus de la v2 (Blender 5.2, Cycles sur la RTX), pour la page claire : les boîtes à archives de la scène du
# sous-sol et l'Olivetti M24, sur fond transparent avec ombre de contact (attrape-ombre), éclairage chaud et sobre.
# Entrées (par leur nom) : job.json (parties à rendre), les textures CC0 de tex_in (Cardboard002, Paper002,
# Plastic013A, Plastic006, Metal032), soussol_props.glb (les objets de la passe 3D, repère three en y haut).
# Sorties dans out/ : WebP 1x et 2x, planches de contrôle sur le fond du site (#edebe7), zones.json.
import bpy, bmesh, math, os, json, random
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

OUT = os.path.abspath('out'); os.makedirs(OUT, exist_ok=True)
JOB = json.load(open('job.json')) if os.path.exists('job.json') else {'parts': ['box', 'open', 'done', 'row', 'm24']}
PARTS = set(JOB['parts'])
QUICK = JOB.get('quick', False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.use_persistent_data = True
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.image_settings.color_mode = 'RGBA'
ZONES = {}
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); print('[v2]', s); LOG.append(s)

def srgb_lin(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1]

BG = 0xedebe7

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for l in list(bpy.data.lights): bpy.data.lights.remove(l)
    for c in list(bpy.data.cameras): bpy.data.cameras.remove(c)

def world(strength=0.55, col=BG):
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = srgb_lin(col); bg.inputs['Strength'].default_value = strength

# ---------------------------------------------------------------- matières
IMG = {}
def img(name, noncolor=True):
    if name in IMG: return IMG[name]
    im = bpy.data.images.load(os.path.abspath(name))
    if noncolor: im.colorspace_settings.name = 'Non-Color'
    IMG[name] = im; return im

def pbr(name, color, rough=0.6, metal=0.0, col_img=None, sat=1.0, nrm=None, nrm_str=0.5, rough_img=None, scale=1.0,
        emit=None, emit_str=0.0, uv=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    coord = None
    if col_img or nrm or rough_img:
        tc = N.new('ShaderNodeUVMap') if uv else N.new('ShaderNodeTexCoord')
        if uv: tc.uv_map = uv
        mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale)
        L.new(tc.outputs['UV'], mp.inputs['Vector']); coord = mp.outputs['Vector']
    if col_img:
        t = N.new('ShaderNodeTexImage'); t.image = img(col_img, False); L.new(coord, t.inputs['Vector'])
        hs = N.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = sat
        L.new(t.outputs['Color'], hs.inputs['Color'])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
        L.new(hs.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = srgb_lin(color)
        L.new(mx.outputs[2], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = srgb_lin(color)
    if nrm:
        t = N.new('ShaderNodeTexImage'); t.image = img(nrm); L.new(coord, t.inputs['Vector'])
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = nrm_str
        L.new(t.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], b.inputs['Normal'])
    if rough_img:
        t = N.new('ShaderNodeTexImage'); t.image = img(rough_img); L.new(coord, t.inputs['Vector'])
        mr = N.new('ShaderNodeMath'); mr.operation = 'MULTIPLY'; mr.inputs[1].default_value = rough / 0.6
        L.new(t.outputs['Color'], mr.inputs[0]); L.new(mr.outputs[0], b.inputs['Roughness'])
    if emit is not None:
        b.inputs['Emission Color'].default_value = srgb_lin(emit); b.inputs['Emission Strength'].default_value = emit_str
    return m

def set_emit(m, s):
    m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = s

def mesh_obj(name, bm, mats, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for mt in mats: me.materials.append(mt)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o); return o

def cube(name, c, s, mat, bev=0.0, seg=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * s[0] + c[0], v.co.y * s[1] + c[1], v.co.z * s[2] + c[2]))
    o = mesh_obj(name, bm, [mat], smooth=bev > 0)
    if bev > 0: bevel(o, bev, seg)
    return o

def bevel(o, w, seg=2):
    b = o.modifiers.new('bev', 'BEVEL'); b.width = w; b.segments = seg; b.limit_method = 'ANGLE'
    b.angle_limit = math.radians(35); b.use_clamp_overlap = True; b.harden_normals = True

def boolean(o, cutter):
    m = o.modifiers.new('b', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    cutter.hide_render = True; cutter.hide_viewport = True

def box_uv(o, scale=1.0):
    """UV en mètres par projection sur l'axe dominant (les cartons et papiers sont en mosaïque)"""
    me = o.data
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            uv.data[li].uv = (u * scale, v * scale)

def freeze(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        if not o.modifiers: continue
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        old = o.data; o.modifiers.clear(); o.data = me; bpy.data.meshes.remove(old)

def catcher(z=0.0, size=8):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    for v in bm.verts: v.co.z = z
    o = mesh_obj('catcher', bm, [pbr('catch', 0xffffff)], smooth=False); o.is_shadow_catcher = True
    return o

def area(name, loc, target, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o

# ---------------------------------------------------------------- la boîte à archives
def materials_box():
    return dict(
        carton=pbr('carton', 0xf0e8da, 0.85, col_img='Cardboard002_1K-JPG_Color.jpg', sat=0.22, nrm='Cardboard002_1K-JPG_NormalGL.jpg',
                   nrm_str=0.55, rough_img='Cardboard002_1K-JPG_Roughness.jpg', scale=2.2),
        inner=pbr('inner', 0x3a3128, 0.95),
        paper=pbr('paper', 0xf6f3ec, 0.8, col_img='Paper002_1K-JPG_Color.jpg', sat=0.3, nrm='Paper002_1K-JPG_NormalGL.jpg', nrm_str=0.25, scale=3.0),
        sheet=pbr('sheet', 0xfbfaf7, 0.75, col_img='Paper002_1K-JPG_Color.jpg', sat=0.2, nrm='Paper002_1K-JPG_NormalGL.jpg', nrm_str=0.2, scale=4.0),
        printed=pbr('printed', 0x6b6152, 0.7),
        amber=pbr('amber', 0xf3a23a, 0.5, emit=0xff9a2e, emit_str=0.0),
        ink=pbr('ink', 0x152127, 0.6),
        fail=pbr('fail', 0xba2c25, 0.6),
        grey=pbr('grey', 0xcdc8be, 0.85, col_img='Paper002_1K-JPG_Color.jpg', sat=0.2, scale=3.0),
        files=pbr('files', 0xe9e2d2, 0.9, col_img='Paper002_1K-JPG_Color.jpg', sat=0.3, scale=3.0),
    )

def make_box(M, x=0.0, W=0.15, H=0.34, D=0.25, tint=1.0, label_mat=None, yoff=0.0, rotz=0.0, small=False):
    """boîte debout, dos (face avant, y négatif) vers la caméra ; renvoie dict d'objets et la charnière du couvercle"""
    objs = []
    cm = M['carton'] if tint == 1.0 else M['carton'].copy()
    if tint != 1.0:
        mx = [n for n in cm.node_tree.nodes if n.type == 'MIX'][0]
        c = srgb_lin(0xf0e8da); mx.inputs[7].default_value = (c[0] * tint, c[1] * tint, c[2] * tint * 0.99, 1)
    lidT, lip = 0.004, 0.032
    # caisse creuse en cinq parois (pas de booléen) : le dedans se voit quand le couvercle se lève
    th = 0.0035; hb = H - lidT
    body = None
    for nm, c, sz in (('wall_f', (x, -D / 2 + th / 2, hb / 2), (W, th, hb)), ('wall_b', (x, D / 2 - th / 2, hb / 2), (W, th, hb)),
                      ('wall_l', (x - W / 2 + th / 2, 0, hb / 2), (th, D - 2 * th, hb)), ('wall_r', (x + W / 2 - th / 2, 0, hb / 2), (th, D - 2 * th, hb)),
                      ('wall_bot', (x, 0, th / 2), (W - 2 * th, D - 2 * th, th))):
        o = cube(nm, c, sz, cm, bev=0.0012); objs.append(o)
        if nm == 'wall_f': body = o
    # trou de préhension : ovale sombre, son bord de carton biseauté par un anneau un peu plus clair
    hz = 0.105 if not small else 0.1
    hr = 0.017 if not small else 0.0135
    for nm, r, mat, dy in (('hole_rim', hr * 1.12, M['printed'], 0.00025), ('hole', hr, M['inner'], 0.0004)):
        bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=r)
        for v in bm.verts: v.co = Vector((v.co.x * 1.3 + x, -D / 2 - dy, v.co.y + hz))
        objs.append(mesh_obj(nm, bm, [mat], smooth=False))
    # dossiers à l'intérieur, sous le bord
    objs.append(cube('files', (x, 0.004, (H - 0.04) / 2 + 0.006), (W - 0.016, D - 0.03, H - 0.05), M['files'], bev=0.002))
    # couvercle : plateau et rabat avant, articulés au bord arrière du dessus
    hinge = bpy.data.objects.new('hinge', None); scene.collection.objects.link(hinge)
    hinge.location = (x, D / 2 + 0.002, H)
    bpy.context.view_layer.update()
    top = cube('lid_top', (x, 0.0, H - lidT / 2), (W + 0.005, D + 0.005, lidT), cm, bev=0.0015)
    front = cube('lid_lip', (x, -D / 2 - 0.0025 - 0.0015, H - lip / 2), (W + 0.005, 0.003, lip), cm, bev=0.0012)
    for o in (top, front):
        o.parent = hinge; o.matrix_parent_inverse = hinge.matrix_world.inverted()
    objs += [top, front]
    # porte-étiquette imprimé et étiquette (zone libre pour le texte de la page)
    lw, lh = (0.112, 0.096) if not small else (0.074, 0.07)
    lz = H - lip - 0.012 - lh / 2
    fy = -D / 2 - 0.0004
    t = 0.004
    for nm, c, s in (('lf_t', (x, fy, lz + lh / 2 + t / 2), (lw + 2 * t, 0.0006, t)), ('lf_b', (x, fy, lz - lh / 2 - t / 2), (lw + 2 * t, 0.0006, t)),
                     ('lf_l', (x - lw / 2 - t / 2, fy, lz), (t, 0.0006, lh)), ('lf_r', (x + lw / 2 + t / 2, fy, lz), (t, 0.0006, lh))):
        objs.append(cube(nm, c, s, M['printed']))
    label = cube('label', (x, fy + 0.0001, lz), (lw, 0.0005, lh), label_mat or M['paper'])
    objs.append(label)
    for o in objs: box_uv(o)
    if yoff or rotz:
        piv = bpy.data.objects.new('piv', None); scene.collection.objects.link(piv); piv.location = (x, 0, 0)
        bpy.context.view_layer.update()
        for o in objs + [hinge]:
            if o.parent is None:
                o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted()
        piv.location = (x, yoff, 0); piv.rotation_euler = (0, 0, rotz)
    # feuille terminée : cachée dans la boîte, sort par le haut
    sheet = cube('sheet', (x - 0.004, -D / 2 + 0.03, H - 0.11), (min(0.13, W - 0.02), 0.0008, 0.16), M['sheet'])
    box_uv(sheet)
    sheet.rotation_euler = (math.radians(-4), 0, 0)
    return dict(objs=objs, hinge=hinge, label=label, sheet=sheet, body=body, lz=lz, lw=lw, lh=lh, fy=fy, W=W, H=H, D=D, x=x)

def ortho_cam(target, tilt_deg, scale, fit='VERTICAL', dist=4.0):
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'; cam.ortho_scale = scale; cam.sensor_fit = fit
    co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
    t = math.radians(tilt_deg)
    co.location = Vector(target) + Vector((0, -math.cos(t), math.sin(t))) * dist
    co.rotation_euler = (math.radians(90 - tilt_deg), 0, 0)
    bpy.context.view_layer.update()
    return co

def px(co, pts):
    """coordonnées pixel (origine en haut à gauche) de points du monde, à la résolution de rendu"""
    W, H = scene.render.resolution_x, scene.render.resolution_y
    out = []
    for p in pts:
        v = world_to_camera_view(scene, co, Vector(p)); out.append((round(v.x * W, 1), round((1 - v.y) * H, 1)))
    return out

def rect_of(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return [min(xs), min(ys), max(xs), max(ys)]

def render_to(path_png):
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = path_png
    bpy.ops.render.render(write_still=True)

def save_webp(src_png, dst, scale=1.0, q=88):
    im = bpy.data.images.load(src_png)
    if scale != 1.0: im.scale(max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale)))
    scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = q
    scene.render.image_settings.color_mode = 'RGBA'
    im.save_render(dst, scene=scene)
    bpy.data.images.remove(im)
    return os.path.getsize(dst)

SIZES = {}
def publish(png, base, q=88, one_x=True):
    """base sans extension, dans out/ : écrit base@2x.webp et base.webp (moitié)"""
    os.makedirs(os.path.dirname(base), exist_ok=True)
    SIZES[os.path.relpath(base + '@2x.webp', OUT)] = save_webp(png, base + '@2x.webp', 1.0, q)
    if one_x: SIZES[os.path.relpath(base + '.webp', OUT)] = save_webp(png, base + '.webp', 0.5, q)

def control_sheet(pngs, dst, cols=4, scale=0.5):
    """planche de contrôle : les rendus posés sur le fond du site"""
    ims = []
    for p in pngs:
        im = bpy.data.images.load(p)
        a = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(a)
        ims.append(a.reshape(im.size[1], im.size[0], 4)); bpy.data.images.remove(im)
    h = max(i.shape[0] for i in ims); w = max(i.shape[1] for i in ims)
    rows = (len(ims) + cols - 1) // cols
    bg = np.array([((BG >> 16) & 255) / 255, ((BG >> 8) & 255) / 255, (BG & 255) / 255, 1.0], np.float32)
    sheet = np.ones((rows * h, cols * w, 4), np.float32) * bg
    for k, i in enumerate(ims):
        r = rows - 1 - k // cols; c = k % cols
        y0 = r * h + (h - i.shape[0]); x0 = c * w
        a = i[..., 3:4]
        sheet[y0:y0 + i.shape[0], x0:x0 + i.shape[1], :3] = i[..., :3] * a + sheet[y0:y0 + i.shape[0], x0:x0 + i.shape[1], :3] * (1 - a)
    out = bpy.data.images.new('sheet', cols * w, rows * h, alpha=True)
    out.colorspace_settings.name = 'Non-Color'
    out.pixels.foreach_set(sheet.ravel()); out.filepath_raw = dst; out.file_format = 'PNG'; out.save()
    bpy.data.images.remove(out)

def box_lights():
    world(0.28)
    area('key', (-0.55, -0.85, 0.95), (0, 0, 0.2), 13, 0.7, (1.0, 0.9, 0.78))
    area('fill', (0.75, -0.7, 0.45), (0, 0, 0.18), 3.5, 0.9, (0.92, 0.95, 1.0))
    area('top', (0.1, 0.3, 1.2), (0, 0, 0.3), 4, 0.8, (1.0, 0.96, 0.9))

TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)

# ---------------------------------------------------------------- 1a. la boîte seule, en quatre états
if PARTS & {'box', 'open', 'done'}:
    clear(); box_lights(); catcher(0.0)
    M = materials_box()
    B = make_box(M)
    scene.render.resolution_x, scene.render.resolution_y = 288, 624
    scene.cycles.samples = 64 if QUICK else 256
    cam = ortho_cam((0, 0, 0.215), 12, 0.50)
    freeze(B['objs'])
    zl = px(cam, [(B['lw'] / -2, B['fy'], B['lz'] + B['lh'] / 2), (B['lw'] / 2, B['fy'], B['lz'] + B['lh'] / 2),
                  (B['lw'] / 2, B['fy'], B['lz'] - B['lh'] / 2), (B['lw'] / -2, B['fy'], B['lz'] - B['lh'] / 2)])
    zb = px(cam, [(-B['W'] / 2, -B['D'] / 2, 0), (B['W'] / 2, -B['D'] / 2, 0), (B['W'] / 2, -B['D'] / 2, B['H']), (-B['W'] / 2, -B['D'] / 2, B['H'])])
    ZONES['box'] = {'size@2x': [288, 624], 'label@2x': rect_of(zl), 'label_corners@2x': zl, 'spine@2x': rect_of(zb)}

    def state(name, label, glow=0.0, sheet=0.0, lid=0.0):
        B['label'].data.materials[0] = M[label]
        set_emit(M['amber'], glow)
        B['hinge'].rotation_euler = (-math.radians(lid), 0, 0)
        B['sheet'].location.z = sheet * 0.13
        bpy.context.view_layer.update()

    pngs = []
    if 'box' in PARTS:
        for name, args in (('rest', ('paper',)), ('active', ('amber', 0.22)), ('done', ('ink', 0.0, 1.0, 4.0)), ('failed', ('fail',))):
            state(name, *args)
            p = os.path.join(TMP, 'box-%s.png' % name); render_to(p); pngs.append(p)
            publish(p, os.path.join(OUT, 'box', 'box-' + name))
        # zone de la feuille, état terminé
        H = B['H']; D = B['D']
        zs = px(cam, [(-0.069, -D / 2 + 0.03, H + 0.005), (0.061, -D / 2 + 0.03, H + 0.005), (0.061, -D / 2 + 0.03, H + 0.095), (-0.069, -D / 2 + 0.03, H + 0.095)])
        ZONES['box']['sheet_done@2x'] = rect_of(zs)
    # 1b. la boîte qui s'ouvre et s'allume : 24 images, couvercle levé puis reposé, étiquette qui s'allume
    if 'open' in PARTS:
        N = 8 if QUICK else 24
        seq = []
        for k in range(N):
            t = k / (N - 1)
            lid = 26 * math.sin(min(1, t / 0.85) * math.pi) ** 1.2
            glow = 0.22 * max(0, min(1, (t - 0.2) / 0.6)) ** 1.5
            state('open', 'amber', glow, 0.0, lid)
            p = os.path.join(TMP, 'open-%02d.png' % k); render_to(p); seq.append(p)
            publish(p, os.path.join(OUT, 'box', 'open', 'box-open-%02d' % k), q=84)
        pngs += seq[::max(1, N // 6)]
        ZONES['box_open'] = {'frames': N, 'first': 'box-rest (étiquette éteinte, couvercle fermé)', 'last': 'box-active'}
        SEQ_OPEN = seq
    # 1c. la boîte qui termine : couvercle entrouvert, la feuille sort, l'étiquette passe de l'ambre à l'encre
    if 'done' in PARTS:
        N = 6 if QUICK else 16
        seq = []
        for k in range(N):
            t = k / (N - 1)
            e = t * t * (3 - 2 * t)
            state('done', 'amber' if t < 0.55 else 'ink', 0.22 * max(0, 1 - t / 0.55), e, 4 * math.sin(min(1, t * 1.2) * math.pi / 2))
            p = os.path.join(TMP, 'done-%02d.png' % k); render_to(p); seq.append(p)
            publish(p, os.path.join(OUT, 'box', 'done', 'box-done-%02d' % k), q=84)
        pngs += seq[::max(1, N // 4)]
        ZONES['box_done'] = {'frames': N, 'first': 'box-active', 'last': 'box-done'}
        SEQ_DONE = seq
    control_sheet(pngs, os.path.join(OUT, 'controle-boite.png'), cols=6)

    # planches en bande (sprite) pour un pilotage GSAP en un seul fichier
    def strip(seq, base):
        ims = []
        for p in seq:
            im = bpy.data.images.load(p); a = np.empty(im.size[0] * im.size[1] * 4, np.float32); im.pixels.foreach_get(a)
            ims.append(a.reshape(im.size[1], im.size[0], 4)); bpy.data.images.remove(im)
        s = np.concatenate(ims, axis=1)
        o = bpy.data.images.new('strip', s.shape[1], s.shape[0], alpha=True); o.colorspace_settings.name = 'Non-Color'
        o.pixels.foreach_set(s.ravel()); p = os.path.join(TMP, os.path.basename(base) + '.png'); o.filepath_raw = p; o.file_format = 'PNG'; o.save()
        bpy.data.images.remove(o)
        publish(p, base, q=82)
    if 'open' in PARTS: strip(SEQ_OPEN, os.path.join(OUT, 'box', 'box-open-strip'))
    if 'done' in PARTS: strip(SEQ_DONE, os.path.join(OUT, 'box', 'box-done-strip'))

# ---------------------------------------------------------------- 1c bis. la rangée de 24 boîtes (section problème)
if 'row' in PARTS:
    clear(); box_lights(); catcher(0.0)
    M = materials_box()
    random.seed(24)
    W, G, N = 0.10, 0.006, 24
    total = N * W + (N - 1) * G
    xs = [-total / 2 + W / 2 + k * (W + G) for k in range(N)]
    boxes = []
    for k, x in enumerate(xs):
        b = make_box(M, x=x, W=W, tint=0.95 + random.random() * 0.08, label_mat=M['grey'], yoff=random.uniform(-0.004, 0.006),
                     rotz=math.radians(random.uniform(-0.5, 0.5)), small=True)
        b['sheet'].hide_render = True
        boxes.append(b)
    shelf_m = pbr('shelf', 0x2a3236, 0.45, metal=0.2, nrm='Metal032_1K-JPG_NormalGL.jpg', nrm_str=0.3, scale=4)
    s1 = cube('shelf', (0, 0.0, -0.006), (total + 0.08, 0.30, 0.012), shelf_m, bev=0.001)
    s2 = cube('shelf_lip', (0, -0.15 - 0.006, -0.02), (total + 0.08, 0.012, 0.04), shelf_m, bev=0.002)
    box_uv(s1); box_uv(s2)
    freeze([o for b in boxes for o in b['objs']] + [s1, s2])
    vext = 0.47; hext = total + 0.1
    scene.render.resolution_x = 2560; scene.render.resolution_y = int(round(2560 * vext / hext / 8) * 8)
    scene.cycles.samples = 64 if QUICK else 192
    cam = ortho_cam((0, 0, 0.16), 10, hext, fit='HORIZONTAL')
    pngs = []
    for name, lab, glow in (('grey', 'grey', 0.0), ('amber', 'amber', 0.2)):
        for b in boxes: b['label'].data.materials[0] = M[lab]
        set_emit(M['amber'], glow)
        p = os.path.join(TMP, 'row-%s.png' % name); render_to(p); pngs.append(p)
        publish(p, os.path.join(OUT, 'row', 'row-' + name), q=86)
    labels = []
    for b in boxes:
        c = px(cam, [(b['x'] - b['lw'] / 2, b['fy'], b['lz'] + b['lh'] / 2), (b['x'] + b['lw'] / 2, b['fy'], b['lz'] - b['lh'] / 2)])
        labels.append(rect_of(c))
    ZONES['row'] = {'size@2x': [scene.render.resolution_x, scene.render.resolution_y], 'count': N, 'labels@2x': labels,
                    'boxes_x@2x': [rect_of(px(cam, [(x - W / 2, -0.125, 0), (x + W / 2, -0.125, 0.34)]))[0::2] for x in xs]}
    control_sheet(pngs, os.path.join(OUT, 'controle-rangee.png'), cols=1)

# ---------------------------------------------------------------- 2. l'Olivetti M24, de face, l'écran laissé libre
if 'm24' in PARTS:
    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath('soussol_props.glb'))
    keep = {'p_m24', 'p_m24dark', 'p_keyL', 'p_keyD', 'p_drive', 'p_crt', 'p_red'}
    for o in list(scene.objects):
        if o.type == 'MESH' and o.name.split('.')[0] not in keep: bpy.data.objects.remove(o, do_unlink=True)
    # l'interrupteur de la Tizio partage la matière m24dark : on retire ce qui est à gauche du poste
    for o in scene.objects:
        if o.type != 'MESH': continue
        bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
        dead = [v for v in bm.verts if v.co.x < -0.3]
        bmesh.ops.delete(bm, geom=dead, context='VERTS')
        bm.transform(o.matrix_world.inverted()); bm.to_mesh(o.data); bm.free()
    absn, absr = 'Plastic013A_1K-JPG_NormalGL.jpg', 'Plastic013A_1K-JPG_Roughness.jpg'
    MM = dict(
        m24=pbr('m24', 0xd8d3c8, 0.5, nrm=absn, nrm_str=0.35, rough_img=absr, scale=7, uv='UVMap'),
        m24dark=pbr('m24dark', 0x3a3b3a, 0.55, nrm=absn, nrm_str=0.35, scale=7, uv='UVMap'),
        keyL=pbr('keyL', 0xc4bdb0, 0.5, nrm=absn, nrm_str=0.3, scale=7, uv='UVMap'),
        keyD=pbr('keyD', 0x6e6d69, 0.55, nrm=absn, nrm_str=0.3, scale=7, uv='UVMap'),
        drive=pbr('drive', 0x1c1d1d, 0.5, nrm=absn, nrm_str=0.3, scale=7, uv='UVMap'),
        crt=pbr('crt', 0x090a0a, 0.2), red=pbr('red', 0x6a1812, 0.5),
    )
    for o in scene.objects:
        if o.type == 'MESH':
            o.data.materials.clear(); o.data.materials.append(MM[o.name.split('.')[0][2:]])
    # l'écran courbe (même géométrie que hero.ts) : 0.272 x 0.17, bombé de 7 mm au centre
    SY, SZ = 1.052, 0.047 - 0.001
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=32, y_segments=20, size=0.5)
    for v in bm.verts:
        x, y = v.co.x * 2, v.co.y * 2
        v.co = Vector((x * 0.136, -(SZ + 0.007 * (1 - 0.5 * x * x - 0.5 * y * y)), SY + y * 0.085))
    hold = bpy.data.materials.new('hold'); hold.use_nodes = True
    N = hold.node_tree.nodes; N.remove(N['Principled BSDF']); h = N.new('ShaderNodeHoldout')
    hold.node_tree.links.new(h.outputs[0], N['Material Output'].inputs['Surface'])
    screen = mesh_obj('screen', bm, [hold])
    glass = pbr('glass', 0x050505, 0.06)
    gb = glass.node_tree.nodes['Principled BSDF']; gb.inputs['Coat Weight'].default_value = 1.0; gb.inputs['Coat Roughness'].default_value = 0.03
    dark = pbr('darkglass', 0x0c0d0c, 0.12, emit=0xffa53a, emit_str=0.015)
    world(0.25)
    TOP = 0.75
    catcher(TOP - 0.0005)
    area('key', (-0.9, -1.0, 1.75), (0, 0, 0.95), 18, 0.9, (1.0, 0.9, 0.78))
    area('fill', (1.0, -0.9, 1.1), (0, 0, 0.95), 5, 1.2, (0.92, 0.95, 1.0))
    area('rim', (0.4, 0.8, 1.6), (0, -0.1, 1.0), 12, 0.6, (1.0, 0.95, 0.9))
    # softbox dont le reflet se voit dans le verre, en haut à gauche
    sb = area('soft', (-0.35, -0.9, 1.45), (0, -0.05, 1.05), 10, 0.35, (1.0, 0.97, 0.92))
    cam = bpy.data.cameras.new('cam'); cam.lens = 70; cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 24
    co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
    # axe horizontal, perpendiculaire à l'écran : l'écran se projette en rectangle ; le cadrage descend par décentrement
    co.location = (0, -1.85, 1.30); co.rotation_euler = (math.radians(90), 0, 0)
    vis_h = 0.80; cam.shift_y = (0.885 - 1.30) / (vis_h * 4 / 3)
    cam.lens = 12 / (vis_h / 2 / 1.85 * 1.0)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
    scene.cycles.samples = 96 if QUICK else 384
    bpy.context.view_layer.update()
    corners = [(-0.136, -SZ, SY + 0.085), (0.136, -SZ, SY + 0.085), (0.136, -SZ, SY - 0.085), (-0.136, -SZ, SY - 0.085)]
    vis = [(-0.131, -0.05, SY + 0.081), (0.131, -0.05, SY + 0.081), (0.131, -0.05, SY - 0.081), (-0.131, -0.05, SY - 0.081)]
    ZONES['m24'] = {'size@2x': [1600, 1200], 'screen_corners@2x': px(co, corners), 'screen@2x': rect_of(px(co, corners)),
                    'screen_visible@2x': rect_of(px(co, vis)),
                    'note': 'écran 640 x 400 (16:10) ; la vidéo se pose sous l\'image, dans screen@2x, le cadre la recouvre'}
    pngs = []
    p = os.path.join(TMP, 'm24-front.png'); render_to(p); pngs.append(p); publish(p, os.path.join(OUT, 'm24', 'm24-front'), q=88)
    screen.data.materials[0] = dark
    p = os.path.join(TMP, 'm24-off.png'); render_to(p); pngs.append(p); publish(p, os.path.join(OUT, 'm24', 'm24-off'), q=88)
    # calque du verre seul : reflets sur fond transparent, à poser par dessus la vidéo
    screen.data.materials[0] = glass
    for o in scene.objects:
        if o.type == 'MESH' and o is not screen: o.is_holdout = True
    p = os.path.join(TMP, 'm24-glass.png'); render_to(p); pngs.append(p); publish(p, os.path.join(OUT, 'm24', 'm24-glass'), q=90)
    control_sheet(pngs[:2], os.path.join(OUT, 'controle-m24.png'), cols=2)
    # 2b. trois quarts, pour les endroits qui évoquent le tutoriel : l'image clé 35 de 2021 sur l'écran, puis l'écran libre
    if 'm24b' in PARTS:
        for o in scene.objects:
            if o.type == 'MESH': o.is_holdout = False
        uvl = screen.data.uv_layers.new(name='UVMap')
        for poly in screen.data.polygons:
            for li in poly.loop_indices:
                v = screen.data.vertices[screen.data.loops[li].vertex_index].co
                uvl.data[li].uv = ((v.x / 0.136 + 1) / 2, ((v.z - SY) / 0.085 + 1) / 2)
        tut = bpy.data.materials.new('tut'); tut.use_nodes = True
        N = tut.node_tree.nodes; Lk = tut.node_tree.links; bs = N['Principled BSDF']
        ti = N.new('ShaderNodeTexImage'); ti.image = img('tutorial-2021.jpg', False); ti.interpolation = 'Closest'
        hs = N.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.55; hs.inputs['Value'].default_value = 0.9
        Lk.new(ti.outputs['Color'], hs.inputs['Color'])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
        Lk.new(hs.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (1.0, 0.86, 0.66, 1)
        bs.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1); bs.inputs['Roughness'].default_value = 0.08
        bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.04
        Lk.new(mx.outputs[2], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 1.6
        screen.data.materials[0] = tut
        cam2 = bpy.data.cameras.new('cam34'); cam2.lens = 58; cam2.sensor_fit = 'HORIZONTAL'
        c2 = bpy.data.objects.new('cam34', cam2); scene.collection.objects.link(c2); scene.camera = c2
        c2.location = (-0.78, -1.5, 1.32)
        c2.rotation_euler = (Vector((0.02, -0.06, 0.965)) - c2.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
        p = os.path.join(TMP, 'm24-34-tutorial.png'); render_to(p); publish(p, os.path.join(OUT, 'm24', 'm24-34-tutorial'), q=88)
        sh = [p]
        screen.data.materials[0] = hold
        p = os.path.join(TMP, 'm24-34-front.png'); render_to(p); publish(p, os.path.join(OUT, 'm24', 'm24-34-front'), q=88)
        sh.append(p)
        ZONES['m24_34'] = {'size@2x': [1600, 1200], 'screen_corners@2x': px(c2, corners),
                           'note': 'trois quarts : l\'écran est un quadrilatère (coins haut gauche, haut droit, bas droit, bas gauche), à caler par matrix3d'}
        control_sheet(sh, os.path.join(OUT, 'controle-m24-34.png'), cols=2)

import shutil
json.dump({'zones': ZONES, 'sizes': SIZES, 'log': LOG}, open(os.path.join(OUT, 'zones.json'), 'w'), indent=1, ensure_ascii=False)
if not JOB.get('keep_png'): shutil.rmtree(TMP, ignore_errors=True)
print('V2 RENDERS OK')
