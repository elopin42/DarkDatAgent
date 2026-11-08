# Le sous-sol sous Blender (Cycles, RTX) : la même pièce que src/room.ts, pour deux sorties.
#  1. out/floor_light.png : la lumière cuite du sol (Tizio, écran, soupirail, appoint, occlusion des rayonnages et du
#     bureau), couleur comprise, sur la zone x -3..3, z -0.75..8.25 (repère three, y vers le haut).
#  2. out/poster.png : l'affiche du hero, depuis la caméra de départ (repli sans WebGL).
# Repère : three (x, y, z) devient Blender (x, -z, y).
import bpy, math, random
from mathutils import Vector

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'GPU'
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX' if 'AgX' in [v.identifier for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Filmic'
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

def T(x, y, z):
    return Vector((x, -z, y))

def srgb(h):
    c = [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1]

MATS = {}
def mat(name, hexc, rough=0.8, metal=0.0, emit=None, strength=0.0):
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

def box(name, x, y, z, w, h, d, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=T(x, y, z))
    o = bpy.context.active_object; o.name = name
    o.scale = (w, d, h)
    o.data.materials.append(m)
    return o

def cyl(name, x, y, z, r, h, m):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=T(x, y, z), vertices=24)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m); return o

wall = mat('wall', 0x1a2a2f, 0.95); floorm = mat('floor', 0x1d2629, 0.85); desk = mat('desk', 0x8d8e8a, 0.42, 0.1)
abs_ = mat('abs', 0x2a2c2d, 0.55); m24 = mat('m24', 0xd6d2c8, 0.5); dark = mat('dark', 0x3a3b3a, 0.6)
steel = mat('steel', 0x5d676a, 0.55, 0.5); lampm = mat('lamp', 0x111213, 0.35, 0.3)
screenm = mat('screen', 0x140b04, 0.3, 0, 0xffa640, 2.2)
winm = mat('win', 0x5f7f8a, 0.5, 0, 0x9cc4d4, 3.0)

DESK_Y = 0.72; TOP = DESK_Y + 0.03; SY, SZ = 1.052, 0.047
# pièce
bpy.ops.mesh.primitive_plane_add(size=1, location=T(0, 0, 3.75)); fl = bpy.context.active_object; fl.name = 'floor'
fl.scale = (6, 9, 1); fl.data.materials.append(floorm)
box('floor_far', 0, -0.01, 5, 30, 0.01, 30, floorm)
box('wall', 0, 2, -0.76, 30, 4, 0.02, wall)
box('ceil', 0, 2.71, 5, 30, 0.02, 30, wall)
box('window', -0.75, 2.42, -0.745, 0.9, 0.3, 0.005, winm)
box('sill', -0.75, 2.25, -0.72, 0.98, 0.04, 0.08, wall)
# bureau
box('desktop', 0, DESK_Y + 0.015, 0, 1.6, 0.03, 0.8, desk)
box('deskside', -0.76, DESK_Y / 2, 0, 0.03, DESK_Y, 0.74, abs_)
box('modesty', 0, DESK_Y - 0.2, -0.36, 1.5, 0.36, 0.02, abs_)
box('pedestal', 0.56, (DESK_Y - 0.02) / 2, 0, 0.42, DESK_Y - 0.02, 0.7, desk)
# M24
box('unit', 0, TOP + 0.065, -0.12, 0.4, 0.13, 0.38, m24)
cyl('foot', 0, TOP + 0.145, -0.1, 0.07, 0.03, dark)
box('bezel', 0, SY, SZ - 0.04, 0.36, 0.3, 0.06, m24)
box('hood', 0, SY + 0.005, SZ - 0.18, 0.3, 0.25, 0.22, m24)
box('screen', 0, SY, SZ - 0.004, 0.272, 0.17, 0.004, screenm)
box('keyboard', 0, TOP + 0.014, 0.25, 0.46, 0.028, 0.18, m24)
# Tizio (simplifiée : base, bras, tête)
cyl('tbase', -0.6, TOP + 0.015, -0.22, 0.058, 0.03, lampm)
box('thead', -0.2, TOP + 0.5, -0.02, 0.08, 0.025, 0.04, lampm)
# rayonnages
random.seed(713)
SHELVES = [0.08, 0.5, 0.92, 1.34, 1.76]
cart = [mat('c%d' % i, h, 0.92) for i, h in enumerate([0x8a7e69, 0x7d725f, 0x968a73, 0x6f6656])]
def rack(x, z0, z1, face, fill=0.92):
    depth = 0.42
    z = z0
    while z <= z1 + 1e-3:
        box('up', x - face * depth / 2, 1.0, z, 0.03, 2.0, 0.03, steel)
        box('up', x + face * depth / 2, 1.0, z, 0.03, 2.0, 0.03, steel)
        z += 1
    for y in SHELVES:
        box('shelf', x, y, (z0 + z1) / 2, depth, 0.015, z1 - z0, steel)
        zz = z0 + 0.04
        while zz < z1 - 0.1:
            if random.random() < fill:
                h = 0.33 if random.random() < 0.7 else 0.25
                box('b', x + face * 0.04, y + 0.008 + h / 2, zz + 0.05, 0.3, h, 0.094, random.choice(cart))
            zz += 0.1
rack(-1.15, -0.65, 1.55, 1); rack(1.15, -0.65, 1.55, -1)
rack(-1.15, 2.65, 5.65, 1); rack(1.15, 2.65, 5.65, -1)
for k in range(1, 4):
    rack(-1.15 - k * 1.1, -0.65, 5.65, 1, 0.85); rack(1.15 + k * 1.1, -0.65, 5.65, -1, 0.85)

# lumières, mêmes positions que room.ts (puissances en watts Blender, réglées à l'œil)
def spot(name, pos, target, color, power, angle, blend):
    d = bpy.data.lights.new(name, 'SPOT'); d.energy = power; d.color = srgb(color)[:3]; d.spot_size = angle * 2; d.spot_blend = blend
    d.shadow_soft_size = 0.02
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = T(*pos)
    o.rotation_euler = (T(*target) - T(*pos)).to_track_quat('-Z', 'Y').to_euler()
spot('tizio', (-0.2, TOP + 0.48, -0.02), (-0.05, TOP, 0.12), 0xffd3a0, 18, 0.78, 0.65)
spot('cold', (-0.75, 2.4, -0.7), (-0.2, 0, 1.4), 0x9cc4d4, 40, 0.5, 0.9)
p = bpy.data.lights.new('aisle', 'POINT'); p.energy = 25; p.color = srgb(0x5c7c86)[:3]; p.shadow_soft_size = 0.3
po = bpy.data.objects.new('aisle', p); scene.collection.objects.link(po); po.location = T(0, 2.3, 2.1)
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb(0x0a1b20)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35

import os
os.makedirs('out', exist_ok=True)

# 1. cuisson du sol, couleur comprise
img = bpy.data.images.new('floor_light', 2048, 3072, float_buffer=True)
n = floorm.node_tree.nodes
tn = n.new('ShaderNodeTexImage'); tn.image = img; n.active = tn
bpy.ops.object.select_all(action='DESELECT'); fl.select_set(True); bpy.context.view_layer.objects.active = fl
scene.cycles.bake_type = 'COMBINED'
scene.render.bake.margin = 4
scene.cycles.samples = 512
bpy.ops.object.bake(type='COMBINED')
img.filepath_raw = os.path.abspath('out/floor_light.exr'); img.file_format = 'OPEN_EXR'; img.save()
img.filepath_raw = os.path.abspath('out/floor_light.png'); img.file_format = 'PNG'; img.save()
n.remove(tn)

# 2. l'affiche depuis la caméra de départ
cam = bpy.data.cameras.new('cam'); cam.sensor_fit = 'VERTICAL'; cam.angle = math.radians(38)
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
co.location = T(0, 1.35, 3.6)
co.rotation_euler = (T(-0.25, 0.98, 0) - T(0, 1.35, 3.6)).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = 1920; scene.render.resolution_y = 1200
scene.cycles.samples = 384
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.abspath('out/poster.png')
bpy.ops.render.render(write_still=True)
print('SOUSSOL BAKE OK')
