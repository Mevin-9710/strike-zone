# Civic Shield operatives (cosmetic variants). Stylized low-poly, T-pose.
# Run: blender -b -P operatives.py -- <outdir>
import bpy, sys, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from style import paint
from mathutils import Vector
OUT = sys.argv[sys.argv.index('--') + 1]

OPS = {
  'rhea':  dict(name='Rhea Voss',    skin=(0.62,0.42,0.30), hair=(0.03,0.025,0.02), jacket=(0.07,0.09,0.13), pants=(0.12,0.13,0.16), accent=(0.10,0.45,1.0), h=1.00, bulk=1.00, head='short_visor', extras=['kneepads','stripes']),
  'kade':  dict(name='Kade Mercer',  skin=(0.45,0.30,0.22), hair=(0.05,0.04,0.03), jacket=(0.22,0.25,0.14), pants=(0.16,0.15,0.11), accent=(1.0,0.55,0.10), h=1.06, bulk=1.25, head='helmet',      extras=['vest','shoulderpads']),
  'yuna':  dict(name='Yuna Sato',    skin=(0.80,0.62,0.48), hair=(0.02,0.02,0.03), jacket=(0.72,0.74,0.78), pants=(0.20,0.22,0.26), accent=(0.05,0.75,0.70), h=0.96, bulk=0.90, head='hood_goggles',extras=['coat','scarf']),
  'tomas': dict(name='Tomas Reyes',  skin=(0.55,0.38,0.26), hair=(0.12,0.08,0.05), jacket=(0.36,0.24,0.14), pants=(0.13,0.14,0.17), accent=(1.0,0.82,0.15), h=1.02, bulk=1.10, head='cap_beard',   extras=['backpack','armchevron']),
  'amara': dict(name='Amara Diallo', skin=(0.28,0.18,0.12), hair=(0.03,0.02,0.02), jacket=(0.22,0.12,0.34), pants=(0.10,0.10,0.14), accent=(0.55,1.0,0.25), h=1.08, bulk=0.95, head='bun_headset', extras=['drone','stripes']),
}

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll): coll.remove(d)

def mat(n, c):
    m = bpy.data.materials.new(n); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*c, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.75
    m.diffuse_color = (*c, 1)  # Workbench uses this
    return m

def build(key, c):
    M = {k: mat(f'{key}_{k}', v) for k, v in dict(skin=c['skin'], hair=c['hair'], jacket=c['jacket'], pants=c['pants'], accent=c['accent'], dark=(0.04,0.04,0.05), lens=(0.6,0.9,1.0), metal=(0.30,0.32,0.36), white=(0.92,0.92,0.9), brow=tuple(x*0.8 for x in c['hair'])).items()}
    parts = []
    B = c['bulk']
    def box(loc, size, m, bev=0.028):
        bpy.ops.mesh.primitive_cube_add(location=loc); o = bpy.context.object
        o.scale = [s / 2 for s in size]; bpy.ops.object.transform_apply(scale=True)
        if bev: md = o.modifiers.new('b', 'BEVEL'); md.width = min(bev, min(size) * 0.45); md.segments = 3
        o.data.materials.append(M[m]); parts.append(o); return o
    def cyl(loc, r, d, m, rot=(0,0,0), v=8):
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=loc, rotation=rot)
        o = bpy.context.object; o.data.materials.append(M[m]); parts.append(o); return o
    # legs
    for s in (-1, 1):
        box((0.11*s*B, 0, 0.72), (0.15*B, 0.17, 0.40), 'pants')
        box((0.11*s*B, 0, 0.33), (0.13*B, 0.15, 0.40), 'pants')
        box((0.11*s*B, -0.035, 0.075), (0.16*B, 0.27, 0.15), 'dark', 0.04)
        box((0.11*s*B, -0.15, 0.06), (0.15*B, 0.05, 0.10), 'metal', 0.02)      # toe cap
        box((0.11*s*B, -0.03, 0.17), (0.155*B, 0.2, 0.03), 'brow', 0.01)        # boot cuff
    # torso
    box((0, 0, 0.95), (0.34*B, 0.20, 0.14), 'pants')
    box((0, 0, 1.03), (0.36*B, 0.21, 0.05), 'dark', 0.005)
    box((0, 0, 1.25), (0.38*B, 0.22, 0.40), 'jacket')
    box((0, -0.02, 1.36), (0.40*B, 0.24, 0.18), 'jacket')
    box((0, 0, 1.50), (0.20, 0.18, 0.06), 'jacket')
    # arms (T-pose)
    sx = 0.25*B
    for s in (-1, 1):
        box((sx*s, 0, 1.42), (0.14, 0.18, 0.14), 'jacket')
        box(((sx+0.17)*s, 0, 1.42), (0.26, 0.12*B, 0.12*B), 'jacket')
        box(((sx+0.25)*s, 0, 1.42), (0.03, 0.125*B, 0.125*B), 'accent', 0)
        box(((sx+0.42)*s, 0, 1.42), (0.26, 0.10*B, 0.10*B), 'jacket')
        box(((sx+0.60)*s, 0, 1.42), (0.12, 0.11, 0.10), 'dark', 0.04)          # chunky glove
        box(((sx+0.53)*s, 0, 1.42), (0.03, 0.125, 0.115), 'accent', 0.01)   # glove cuff
    # head base
    box((0, 0, 1.56), (0.09, 0.09, 0.06), 'skin', 0)
    box((0, 0, 1.68), (0.19, 0.21, 0.22), 'skin', 0.03)
    eyes = True
    hd = c['head']
    if hd == 'short_visor':
        box((0, 0.01, 1.80), (0.21, 0.23, 0.06), 'hair')
        box((0, 0.08, 1.70), (0.21, 0.08, 0.18), 'hair')
        for s in (-1, 1): box((0.10*s, 0.02, 1.72), (0.03, 0.17, 0.12), 'hair', 0.01)
        box((0, -0.04, 1.80), (0.22, 0.14, 0.035), 'accent', 0.01)
    elif hd == 'helmet':
        box((0, 0.01, 1.76), (0.25, 0.27, 0.16), 'metal', 0.04)
        box((0, -0.12, 1.70), (0.21, 0.03, 0.035), 'accent', 0.005)   # visor slit
        box((0, -0.115, 1.61), (0.17, 0.03, 0.06), 'metal', 0.01)     # jaw guard
        eyes = False
    elif hd == 'hood_goggles':
        box((0, 0.03, 1.72), (0.25, 0.25, 0.28), 'jacket', 0.05)       # hood
        box((0, -0.105, 1.71), (0.20, 0.02, 0.05), 'lens', 0.01)       # goggles
        box((0, -0.105, 1.71), (0.22, 0.015, 0.02), 'dark', 0)
        eyes = False
    elif hd == 'cap_beard':
        box((0, 0.01, 1.80), (0.21, 0.23, 0.07), 'accent', 0.02)       # cap
        box((0, -0.15, 1.78), (0.19, 0.10, 0.015), 'accent', 0.005)    # brim
        box((0, -0.09, 1.61), (0.18, 0.06, 0.09), 'hair', 0.02)        # beard
    elif hd == 'bun_headset':
        box((0, 0.01, 1.80), (0.20, 0.22, 0.05), 'hair')
        box((0, 0.10, 1.84), (0.10, 0.10, 0.10), 'hair', 0.03)         # bun
        for s in (-1, 1): box((0.105*s, 0, 1.68), (0.03, 0.07, 0.07), 'dark', 0.01)
        cyl((0.12, 0.0, 1.82), 0.008, 0.18, 'accent')                   # antenna
        box((0.07, -0.10, 1.63), (0.08, 0.015, 0.015), 'dark', 0)       # mic boom
    if eyes:   # painted-style face: eye whites, pupils looking slightly inward, brows, mouth
        for s in (-1, 1):
            box((0.047*s, -0.109, 1.69), (0.044, 0.008, 0.036), 'white', 0.006)
            box((0.042*s, -0.114, 1.688), (0.02, 0.006, 0.024), 'dark', 0.004)
            box((0.05*s, -0.11, 1.722), (0.05, 0.008, 0.012), 'brow', 0.004)
        box((0, -0.109, 1.635), (0.045, 0.006, 0.008), 'brow', 0.002)
        box((0, -0.115, 1.665), (0.03, 0.02, 0.035), 'skin', 0.008)        # nose
    # shared gear: chest pockets, zipper seam, belt + buckle, shoulder seams
    for s in (-1, 1):
        box((0.09*s*B, -0.118, 1.33), (0.11, 0.025, 0.10), 'jacket', 0.012)
        box((0.09*s*B, -0.132, 1.37), (0.11, 0.006, 0.02), 'dark', 0.002)
    box((0, -0.114, 1.25), (0.012, 0.006, 0.34), 'dark', 0)
    box((0, -0.11, 1.03), (0.06, 0.012, 0.045), 'metal', 0.005)
    ex = c['extras']
    if 'kneepads' in ex:
        for s in (-1, 1): box((0.11*s*B, -0.09, 0.52), (0.11, 0.03, 0.10), 'accent', 0.01)
    if 'stripes' in ex:
        for s in (-1, 1): box((0.12*s*B, -0.135, 1.30), (0.03, 0.01, 0.34), 'accent', 0)
    if 'vest' in ex:
        box((0, -0.03, 1.30), (0.44*B, 0.28, 0.36), 'metal', 0.03)
        box((0, -0.175, 1.32), (0.16, 0.01, 0.05), 'accent', 0)
    if 'shoulderpads' in ex:
        for s in (-1, 1): box((sx*s, 0, 1.50), (0.20, 0.22, 0.08), 'metal', 0.03)
    if 'coat' in ex:
        for s in (-1, 1): box((0.11*s*B, 0.02, 0.78), (0.21*B, 0.26, 0.42), 'jacket', 0.02)
    if 'scarf' in ex:
        box((0, -0.02, 1.53), (0.24, 0.22, 0.07), 'accent', 0.03)
    if 'backpack' in ex:
        box((0, 0.20, 1.27), (0.30*B, 0.16, 0.34), 'pants', 0.03)
        box((0, 0.285, 1.27), (0.12, 0.01, 0.12), 'accent', 0)
    if 'armchevron' in ex:
        for s in (-1, 1): box(((sx+0.12)*s, -0.065*B, 1.42), (0.06, 0.01, 0.06), 'accent', 0)
    if 'drone' in ex:
        box((-sx, 0, 1.53), (0.10, 0.10, 0.04), 'dark', 0)                       # mount
        box((-sx, 0, 1.62), (0.14, 0.14, 0.05), 'metal', 0.02)                   # drone body
        for dx, dy in ((-1,-1),(1,-1),(-1,1),(1,1)):
            cyl((-sx + dx*0.09, dy*0.09, 1.65), 0.045, 0.01, 'accent', v=10)    # rotors
        box((-sx, -0.075, 1.62), (0.04, 0.01, 0.03), 'lens', 0)
    # toy proportions: big head, thicker arms and legs (scaled about each part's own center / the head pivot)
    from mathutils import Matrix
    for o in parts:
        ctr = sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
        if ctr.z >= 1.54 and abs(ctr.x) < 0.17:
            o.data.transform(Matrix.Translation(-Vector((0, 0, 1.6))) @ o.matrix_world)
            o.data.transform(Matrix.Diagonal((1.3, 1.3, 1.3, 1)))
            o.data.transform(Matrix.Translation(Vector((0, 0, 1.6)))); o.matrix_world = Matrix()
        elif 1.3 < ctr.z < 1.55 and abs(ctr.x) > sx + 0.05:
            o.data.transform(Matrix.Translation(-ctr) @ o.matrix_world)
            o.data.transform(Matrix.Diagonal((1.0, 1.22, 1.22, 1)))
            o.data.transform(Matrix.Translation(ctr)); o.matrix_world = Matrix()
        elif ctr.z < 0.95 and abs(ctr.x) > 0.02:
            o.data.transform(Matrix.Translation(-ctr) @ o.matrix_world)
            o.data.transform(Matrix.Diagonal((1.12, 1.12, 1.0, 1)))
            o.data.transform(Matrix.Translation(ctr)); o.matrix_world = Matrix()
    # apply modifiers, join, scale height
    for o in parts:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.object; ob.name = c['name'].replace(' ', '_')
    ob.scale = (c['h'], c['h'], c['h']); bpy.ops.object.transform_apply(scale=True)
    return ob

def render(key, ob):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 560, 540
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.14, 0.16, 0.20, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.8
    sc.world = w
    bpy.ops.object.light_add(type='SUN', location=(2, -3, 4)); sun = bpy.context.object
    sun.rotation_euler = (math.radians(45), math.radians(10), math.radians(35)); sun.data.energy = 3.5
    bpy.ops.object.light_add(type='AREA', location=(-2, 2.5, 2.5)); rim = bpy.context.object
    rim.data.energy = 120; rim.data.size = 2
    rim.rotation_euler = (math.radians(-50), math.radians(-30), 0)
    bpy.ops.mesh.primitive_plane_add(size=6); fl = bpy.context.object
    fm = mat('floor', (0.20, 0.22, 0.26)); fl.data.materials.append(fm)
    bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.6
    for nm, loc, rot in [('front', (0, -6, 1.05), (90, 0, 0)), ('three', (4.2, -4.2, 1.05), (90, 0, 45)), ('side', (6, 0, 1.05), (90, 0, 90))]:
        cam.location = loc; cam.rotation_euler = [math.radians(a) for a in rot]
        sc.render.filepath = f'{OUT}/{key}_{nm}.png'
        bpy.ops.render.render(write_still=True)

ONLY = sys.argv[sys.argv.index('--') + 2:]
for key, c in OPS.items():
    if ONLY and key not in ONLY: continue
    clear()
    ob = build(key, c)
    paint(ob, ao_dist=0.4, grad=0.32, grime=0.14, seed=hash(key) % 97)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/../{key}.glb', export_format='GLB', use_selection=True)
    render(key, ob)
    print(f'OP {key} tris={tris}')
