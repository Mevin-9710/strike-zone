# Meridian Covenant enemies. Single red tone (shades of one hue only).
# Run: blender -b -P enemies.py -- <outdir> [keys...]
import bpy, sys, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from style import paint
from mathutils import Vector, Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
OUT, ONLY = argv[0], argv[1:]

RED = dict(base=(0.42,0.05,0.05), dark=(0.16,0.02,0.02), light=(0.70,0.12,0.10), deep=(0.08,0.01,0.01), glow=(1.0,0.15,0.08))

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll): coll.remove(d)

def mats(key):
    M = {}
    for k, c in RED.items():
        m = bpy.data.materials.new(f'{key}_{k}'); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = 0.7
        if k == 'glow':
            b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = 3
        M[k] = m
    return M

class Kit:
    def __init__(s, M): s.M, s.parts = M, []
    def box(s, loc, size, m, bev=0.028, rot=(0,0,0)):
        bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot); o = bpy.context.object
        o.scale = [v/2 for v in size]; bpy.ops.object.transform_apply(scale=True)
        if bev: md = o.modifiers.new('b','BEVEL'); md.width = min(bev, min(size) * 0.45); md.segments = 3
        o.data.materials.append(s.M[m]); s.parts.append(o); return o
    def cyl(s, loc, r, d, m, rot=(0,0,0), v=10):
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=loc, rotation=rot)
        o = bpy.context.object; o.data.materials.append(s.M[m]); s.parts.append(o); return o
    def beam(s, p1, p2, r, m, v=6):
        from mathutils import Vector
        a, b = Vector(p1), Vector(p2); d = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d.length, location=(a+b)/2)
        o = bpy.context.object
        o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0,0,1)).rotation_difference(d.normalized())
        o.data.materials.append(s.M[m]); s.parts.append(o); return o
    def toy(s, sx=0.25):
        for o in s.parts:
            ctr = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
            if ctr.z >= 1.54 and abs(ctr.x) < 0.17:
                M = Matrix.Translation(Vector((0, 0, 1.6))) @ Matrix.Diagonal((1.3, 1.3, 1.3, 1)) @ Matrix.Translation(-Vector((0, 0, 1.6)))
            elif 1.3 < ctr.z < 1.55 and abs(ctr.x) > sx + 0.05:
                M = Matrix.Translation(ctr) @ Matrix.Diagonal((1.0, 1.22, 1.22, 1)) @ Matrix.Translation(-ctr)
            elif ctr.z < 0.95 and abs(ctr.x) > 0.02:
                M = Matrix.Translation(ctr) @ Matrix.Diagonal((1.12, 1.12, 1.0, 1)) @ Matrix.Translation(-ctr)
            else:
                continue
            o.data.transform(M @ o.matrix_world); o.matrix_world = Matrix()
    def join(s, name):
        for o in s.parts:
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.ops.object.select_all(action='DESELECT')
        for o in s.parts: o.select_set(True)
        bpy.context.view_layer.objects.active = s.parts[0]; bpy.ops.object.join()
        ob = bpy.context.object; ob.name = name; return ob

R90 = math.radians(90)

def sniper(K):
    for x in (-1, 1):
        K.box((0.11*x, 0, 0.72), (0.15, 0.17, 0.40), 'dark')
        K.box((0.11*x, 0, 0.33), (0.13, 0.15, 0.40), 'dark')
        K.box((0.11*x, -0.03, 0.07), (0.14, 0.24, 0.14), 'deep')
        K.box((0.12*x, 0.02, 0.80), (0.20, 0.25, 0.46), 'base', 0.02)   # long coat tails
    K.box((0, 0, 1.03), (0.36, 0.21, 0.05), 'deep', 0.005)
    K.box((0, 0, 1.27), (0.38, 0.22, 0.44), 'base')
    K.box((0, -0.02, 1.38), (0.40, 0.24, 0.16), 'base')
    K.box((0, 0.02, 1.50), (0.52, 0.30, 0.08), 'light', 0.03)          # shoulder cape
    K.box((0, -0.125, 1.25), (0.06, 0.01, 0.36), 'light', 0)           # front seam
    for x in (-1, 1):
        K.box((0.42*x, 0, 1.42), (0.26, 0.12, 0.12), 'base')
        K.box((0.67*x, 0, 1.42), (0.26, 0.10, 0.10), 'dark')
        K.box((0.85*x, 0, 1.42), (0.10, 0.09, 0.08), 'deep')
    K.box((0, 0, 1.56), (0.09, 0.09, 0.06), 'deep', 0)
    K.box((0, 0.02, 1.71), (0.25, 0.25, 0.28), 'base', 0.05)            # hood
    K.box((0, -0.10, 1.66), (0.19, 0.04, 0.16), 'deep', 0.02)           # face mask
    K.cyl((0.04, -0.13, 1.70), 0.035, 0.05, 'glow', rot=(R90,0,0))      # single scope eye
    # rifle on back
    K.box((0, 0.17, 1.25), (0.05, 0.05, 1.05), 'deep', 0.005, rot=(0, math.radians(30), 0))
    K.cyl((-0.10, 0.20, 1.45), 0.03, 0.22, 'dark', rot=(0, math.radians(30), 0))
    K.box((0, 0.13, 1.25), (0.42, 0.02, 0.04), 'light', 0, rot=(0, math.radians(30), 0))  # strap

def drone(K):
    K.box((0, 0, 1.4), (0.40, 0.40, 0.14), 'base', 0.04)
    K.box((0, 0, 1.49), (0.24, 0.24, 0.06), 'dark', 0.02)
    for a in (45, 135, 225, 315):
        r = math.radians(a); x, y = 0.30*math.cos(r), 0.30*math.sin(r)
        K.box((x/2, y/2, 1.42), (0.42, 0.05, 0.04), 'dark', 0.005, rot=(0,0,r))
        K.cyl((x, y, 1.46), 0.03, 0.06, 'deep')
        K.cyl((x, y, 1.50), 0.13, 0.01, 'light', v=14)
    K.box((0, -0.20, 1.36), (0.14, 0.06, 0.10), 'deep', 0.02)
    K.cyl((0, -0.235, 1.36), 0.035, 0.02, 'glow', rot=(R90,0,0))
    K.box((0, 0, 1.28), (0.06, 0.06, 0.10), 'dark', 0)
    K.cyl((0, -0.06, 1.22), 0.02, 0.18, 'deep', rot=(R90,0,0))         # under-gun

def turret(K):
    for a in (90, 210, 330):
        r = math.radians(a); c, si = math.cos(r), math.sin(r)
        K.beam((0.42*c, 0.42*si, 0.03), (0.10*c, 0.10*si, 0.48), 0.035, 'dark')
        K.box((0.42*c, 0.42*si, 0.02), (0.12, 0.12, 0.04), 'deep', 0.01)
    K.cyl((0, 0, 0.50), 0.16, 0.10, 'base', v=12)
    K.cyl((0, 0, 0.60), 0.10, 0.10, 'dark', v=12)
    K.box((0, 0, 0.78), (0.36, 0.40, 0.26), 'base', 0.04)               # head
    K.box((0, -0.21, 0.80), (0.24, 0.03, 0.08), 'deep', 0.01)
    K.cyl((0, -0.225, 0.80), 0.03, 0.02, 'glow', rot=(R90,0,0))
    for x in (-1, 1):
        K.cyl((0.13*x, -0.38, 0.74), 0.035, 0.42, 'dark', rot=(R90,0,0))
        K.cyl((0.13*x, -0.60, 0.74), 0.045, 0.05, 'deep', rot=(R90,0,0))
    K.box((0, 0.24, 0.80), (0.28, 0.10, 0.18), 'light', 0.03)           # ammo box
    K.box((0.20, 0, 0.88), (0.04, 0.30, 0.10), 'light', 0.01)


def body(K, bulk=1.0, coat=None):
    B = bulk
    for x in (-1, 1):
        K.box((0.11*x*B, 0, 0.72), (0.15*B, 0.17, 0.40), 'dark')
        K.box((0.11*x*B, 0, 0.33), (0.13*B, 0.15, 0.40), 'dark')
        K.box((0.11*x*B, -0.03, 0.07), (0.14*B, 0.24, 0.14), 'deep')
        if coat: K.box((0.12*x*B, 0.02, 0.80), (0.21*B, 0.26, 0.46), coat, 0.02)
    K.box((0, 0, 1.03), (0.36*B, 0.21, 0.05), 'deep', 0.005)
    K.box((0, 0, 1.27), (0.38*B, 0.22, 0.44), 'base')
    K.box((0, -0.02, 1.38), (0.40*B, 0.24, 0.16), 'base')
    sx = 0.25*B
    for x in (-1, 1):
        K.box((sx*x, 0, 1.42), (0.14, 0.18, 0.14), 'base')
        K.box(((sx+0.17)*x, 0, 1.42), (0.26, 0.12*B, 0.12*B), 'base')
        K.box(((sx+0.42)*x, 0, 1.42), (0.26, 0.10*B, 0.10*B), 'dark')
        K.box(((sx+0.60)*x, 0, 1.42), (0.10, 0.09, 0.08), 'deep')
    K.box((0, 0, 1.56), (0.09, 0.09, 0.06), 'deep', 0)
    for x in (-1, 1):
        K.box((0.13*x*B, -0.115, 1.0), (0.08, 0.05, 0.08), 'dark', 0.015)            # belt pouches
        K.box(((sx+0.53)*x, 0, 1.42), (0.035, 0.13, 0.12), 'light', 0.01)          # glove cuffs
        K.box((0.08*x*B, -0.116, 1.3), (0.03, 0.01, 0.36), 'deep', 0)              # chest straps
    K.box((0, -0.12, 1.03), (0.06, 0.012, 0.045), 'light', 0.005)                  # buckle
    return sx

def guard(K):
    body(K)
    K.box((0, -0.03, 1.30), (0.42, 0.27, 0.34), 'light', 0.03)          # vest
    K.box((0, -0.17, 1.22), (0.30, 0.02, 0.10), 'dark', 0.005)           # mag pouches
    K.box((0, 0, 1.70), (0.23, 0.25, 0.24), 'base', 0.04)                # helmet
    K.box((0, -0.12, 1.66), (0.19, 0.03, 0.06), 'deep', 0.01)            # visor band
    K.box((0, -0.135, 1.66), (0.15, 0.01, 0.02), 'glow', 0)
    K.box((0, 0.17, 1.25), (0.06, 0.08, 0.80), 'deep', 0.005, rot=(0, math.radians(-35), 0))   # rifle on back

def heavy(K):
    sx = body(K, 1.35)
    K.box((0, -0.03, 1.30), (0.58, 0.32, 0.44), 'light', 0.04)          # plate armor
    for x in (-1, 1):
        K.box((sx*x, 0, 1.52), (0.26, 0.28, 0.12), 'light', 0.04)        # pauldrons
        K.box((0.15*x, -0.11, 0.52), (0.14, 0.04, 0.14), 'light', 0.02)  # knee plates
    K.box((0, 0, 1.72), (0.28, 0.29, 0.26), 'base', 0.05)                # full helm
    K.box((0, -0.15, 1.71), (0.22, 0.02, 0.04), 'glow', 0)
    K.box((0, -0.15, 1.62), (0.16, 0.03, 0.08), 'deep', 0.01)
    K.cyl((0.24, 0.32, 1.28), 0.06, 0.80, 'deep')                         # heavy cannon on back
    K.box((0, 0.22, 1.30), (0.34, 0.14, 0.40), 'dark', 0.03)             # backpack generator

def commander(K):
    body(K, 1.05, coat='base')
    K.box((0, 0.02, 1.52), (0.56, 0.30, 0.08), 'light', 0.03)          # mantle
    K.box((0, -0.125, 1.28), (0.05, 0.01, 0.42), 'light', 0)
    for x in (-1, 1): K.box((0.13*x, -0.13, 1.40), (0.06, 0.01, 0.06), 'glow', 0)   # rank lights
    K.box((0, 0, 1.68), (0.19, 0.21, 0.22), 'light', 0.03)               # head (mask)
    K.box((0, 0.01, 1.81), (0.21, 0.23, 0.05), 'deep', 0.01)             # slicked hair
    K.box((0, -0.105, 1.69), (0.15, 0.01, 0.03), 'glow', 0)              # visor
    K.box((0, 0.03, 1.66), (0.27, 0.26, 0.10), 'base', 0.02)             # high collar
    K.cyl((-0.20, -0.04, 0.95), 0.03, 0.18, 'deep')                      # sidearm

ENEMIES = {'sniper': (sniper, 2.6, 1.05), 'guard': (guard, 2.6, 1.05), 'heavy': (heavy, 2.9, 1.05), 'commander': (commander, 2.6, 1.05), 'drone': (drone, 1.3, 1.38), 'turret': (turret, 1.6, 0.55)}

def render(key, scale, zc):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 560, 540
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.14, 0.16, 0.20, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.8; sc.world = w
    bpy.ops.object.light_add(type='SUN', location=(2,-3,4)); s = bpy.context.object
    s.rotation_euler = (math.radians(45), math.radians(10), math.radians(35)); s.data.energy = 3.5
    bpy.ops.object.light_add(type='AREA', location=(-2,2.5,2.5)); a = bpy.context.object
    a.data.energy = 120; a.data.size = 2; a.rotation_euler = (math.radians(-50), math.radians(-30), 0)
    bpy.ops.mesh.primitive_plane_add(size=6); f = bpy.context.object
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.20,0.22,0.26,1); f.data.materials.append(fm)
    bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale
    for nm, loc, rot in [('front',(0,-6,zc),(90,0,0)), ('three',(4.2,-4.2,zc+0.6),(82,0,45)), ('side',(6,0,zc),(90,0,90))]:
        cam.location = loc; cam.rotation_euler = [math.radians(v) for v in rot]
        sc.render.filepath = f'{OUT}/{key}_{nm}.png'; bpy.ops.render.render(write_still=True)

for key, (fn, scale, zc) in ENEMIES.items():
    if ONLY and key not in ONLY: continue
    clear(); K = Kit(mats(key)); fn(K)
    if key in ('guard', 'heavy', 'sniper', 'commander'): K.toy(0.25 * {'heavy': 1.35, 'commander': 1.05}.get(key, 1.0))
    ob = K.join(key)
    paint(ob, ao_dist=0.4, grad=0.32, grime=0.16, seed=len(key))
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/../enemy_{key}.glb', export_format='GLB', use_selection=True)
    render(key, scale, zc)
    print(f'EN {key} tris={tris}')
