# Objective props: the Covenant device (defuse target) and the Civic Shield counter-charge (plant).
# Origin = floor center, front faces -Y, meters. Top sits ~0.24 m high so kneeling hands rest on it.
# Run: blender -b -P props.py -- <models_dir>
import bpy, sys, math, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from style import paint
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
MODELS = argv[0]
OUT = os.path.join(MODELS, 'props'); os.makedirs(OUT, exist_ok=True)
REN = os.path.join(MODELS, 'renders', 'props'); os.makedirs(REN, exist_ok=True)
R = math.radians

PALETTES = {
    'civic': {'base': (0.10, 0.11, 0.13), 'dark': (0.05, 0.055, 0.06), 'deep': (0.03, 0.03, 0.035),
              'light': (0.26, 0.28, 0.31), 'glow': (0.15, 0.55, 1.0)},
    'covenant_device': {'base': (0.42, 0.05, 0.05), 'dark': (0.16, 0.02, 0.02), 'deep': (0.08, 0.01, 0.01),
                        'light': (0.70, 0.12, 0.10), 'glow': (1.0, 0.12, 0.06)},
    'counter_charge': {'base': (0.10, 0.11, 0.13), 'dark': (0.05, 0.055, 0.06), 'deep': (0.03, 0.03, 0.035),
                       'light': (0.26, 0.28, 0.31), 'glow': (0.15, 0.55, 1.0)},
}


def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll): coll.remove(d)


class Kit:
    def __init__(s, key):
        s.parts, s.M, s.named = [], {}, []
        for k, c in PALETTES[key].items():
            m = bpy.data.materials.new(f'{key}_{k}'); m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = 0.6
            b.inputs['Metallic'].default_value = 0.3 if k in ('light', 'base') else 0.0
            if k == 'glow':
                b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = 4
            s.M[k] = m

    def B(s, loc, size, m, bev=0.006, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(location=loc, rotation=[R(a) for a in rot]); o = bpy.context.object
        o.scale = [v / 2 for v in size]; bpy.ops.object.transform_apply(scale=True)
        if bev: md = o.modifiers.new('b', 'BEVEL'); md.width = min(bev, min(size) * 0.4); md.segments = 3
        o.data.materials.append(s.M[m]); s.parts.append(o); return o

    def C(s, loc, r, depth, m, v=12, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=depth, location=loc, rotation=[R(a) for a in rot])
        o = bpy.context.object; o.data.materials.append(s.M[m]); s.parts.append(o); return o

    def sep(s, name):
        o = s.parts.pop(); o.name = name; s.named.append(o)

    def join(s, name):
        for o in s.parts:
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.ops.object.select_all(action='DESELECT')
        for o in s.parts: o.select_set(True)
        bpy.context.view_layer.objects.active = s.parts[0]; bpy.ops.object.join()
        ob = bpy.context.object; ob.name = name; return ob


def covenant_device(K):
    """Hostile sabotage core: hex body, glowing ring, four fuel cells, timer dome, antenna."""
    K.C((0, 0, 0.02), 0.20, 0.04, 'deep', v=6)                      # base plate
    K.C((0, 0, 0.11), 0.13, 0.14, 'base', v=6)                      # core body
    K.C((0, 0, 0.12), 0.135, 0.02, 'glow', v=6)                     # glow ring
    for a in (45, 135, 225, 315):
        x, y = 0.15 * math.cos(R(a)), 0.15 * math.sin(R(a))
        K.C((x, y, 0.09), 0.035, 0.12, 'dark', v=8)                 # fuel cells
        K.C((x, y, 0.155), 0.028, 0.012, 'glow', v=8)
    K.C((0, 0, 0.20), 0.09, 0.04, 'light', v=6)                     # cap
    K.B((0, -0.075, 0.205), (0.10, 0.012, 0.035), 'glow', 0, rot=(-20, 0, 0))   # timer screen
    for x in (-0.03, 0, 0.03): K.B((x, 0.02, 0.228), (0.02, 0.02, 0.012), 'deep', 0.002)  # keys
    K.C((0.06, 0.05, 0.27), 0.006, 0.10, 'deep', v=6)               # antenna
    K.C((0.06, 0.05, 0.325), 0.012, 0.012, 'glow', v=8)


def counter_charge(K):
    """Civic Shield breaching charge: hard case, twin canisters, keypad, status strip, carry handle."""
    K.B((0, 0, 0.07), (0.30, 0.22, 0.14), 'base')                   # case
    K.B((0, 0, 0.145), (0.31, 0.23, 0.012), 'light', 0.003)         # lid rim
    for x in (-0.09, 0.09):
        K.C((x, 0.0, 0.20), 0.045, 0.10, 'dark', v=10)              # canisters
        K.C((x, 0.0, 0.252), 0.038, 0.006, 'light', v=10)
        K.C((x, 0.0, 0.17), 0.047, 0.01, 'glow', v=10)              # canister glow band
    K.B((0, -0.065, 0.165), (0.10, 0.07, 0.03), 'deep', 0.003, rot=(-15, 0, 0))   # keypad block
    K.B((0, -0.085, 0.178), (0.07, 0.012, 0.025), 'glow', 0, rot=(-15, 0, 0))     # screen
    for x in (-0.02, 0, 0.02): K.B((x, -0.05, 0.183), (0.014, 0.014, 0.008), 'light', 0.002, rot=(-15, 0, 0))
    K.B((0, -0.111, 0.07), (0.24, 0.004, 0.012), 'glow', 0)         # front status strip
    K.B((0, 0.09, 0.19), (0.16, 0.014, 0.014), 'deep', 0.002)       # handle bar
    for x in (-0.07, 0.07): K.B((x, 0.09, 0.165), (0.014, 0.014, 0.04), 'deep', 0.002)


def smoke_canister(K):
    K.C((0, 0, 0.08), 0.045, 0.16, 'base', v=12)
    K.C((0, 0, 0.165), 0.03, 0.016, 'light', v=10)
    K.B((0.02, 0, 0.17), (0.05, 0.012, 0.012), 'light', 0.002)          # spoon
    K.C((0, 0, 0.11), 0.047, 0.02, 'glow', v=12)
    for z in (0.03, 0.06): K.C((0, 0, z), 0.0465, 0.006, 'dark', v=12)


def flash_orb(K):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.05, location=(0, 0, 0.05)); o = bpy.context.object
    o.data.materials.append(K.M['light']); K.parts.append(o)
    for a in range(4):
        K.B((0.035 * math.cos(math.radians(a * 90)), 0.035 * math.sin(math.radians(a * 90)), 0.05), (0.02, 0.02, 0.06), 'glow', 0.004)
    K.C((0, 0, 0.1), 0.012, 0.02, 'dark', v=8)


def decoy_puck(K):
    K.C((0, 0, 0.02), 0.08, 0.04, 'base', v=16)
    K.C((0, 0, 0.042), 0.06, 0.006, 'glow', v=16)
    K.C((0, 0, 0.05), 0.03, 0.012, 'light', v=12)


def sensor_puck(K):
    K.C((0, 0, 0.025), 0.12, 0.05, 'base', v=8)
    for a in range(3):
        r = math.radians(a * 120)
        K.B((0.07 * math.cos(r), 0.07 * math.sin(r), 0.11), (0.022, 0.022, 0.13), 'light', 0.006)
    K.C((0, 0, 0.19), 0.035, 0.035, 'glow', v=10)


def recon_drone(K):
    K.B((0, 0, 0.0), (0.24, 0.24, 0.07), 'base', 0.02)
    K.B((0, 0, 0.05), (0.13, 0.13, 0.04), 'light', 0.012)
    K.C((0, -0.12, -0.005), 0.03, 0.03, 'glow', v=10)
    for i, (x, y) in enumerate([(1, 1), (-1, 1), (1, -1), (-1, -1)]):
        K.B((x * 0.13, y * 0.13, 0.015), (0.2, 0.025, 0.02), 'dark', 0.005)
        K.parts[-1].rotation_euler = (0, 0, math.atan2(y, x)); bpy.context.view_layer.objects.active = K.parts[-1]
        K.C((x * 0.2, y * 0.2, 0.03), 0.02, 0.03, 'dark', v=8)
        K.C((x * 0.2, y * 0.2, 0.05), 0.09, 0.006, 'glow', v=12); K.sep(f'rotor{i}')


PROPS = [('covenant_device', covenant_device), ('counter_charge', counter_charge), ('smoke_canister', smoke_canister),
         ('flash_orb', flash_orb), ('decoy_puck', decoy_puck), ('sensor_puck', sensor_puck), ('recon_drone', recon_drone)]
PAL_OF = {'covenant_device': 'covenant_device', 'counter_charge': 'counter_charge'}


def render(pid, ob):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 480, 360
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.12, 0.14, 0.17, 1); sc.world = w
    bpy.ops.object.light_add(type='SUN'); s = bpy.context.object; s.data.energy = 3; s.rotation_euler = (R(40), R(10), R(30))
    bpy.ops.mesh.primitive_plane_add(size=4)
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))); hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    bpy.ops.object.empty_add(location=(lo + hi) / 2); tgt = bpy.context.object
    size = max((hi - lo).length * 1.15, 0.2)
    bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = size
    con = cam.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    for nm, loc in [('front', (0.9, -1.4, 0.9)), ('back', (-1.2, 1.0, 1.1))]:
        cam.location = tgt.location + Vector(loc) * 1.0
        sc.render.filepath = os.path.join(REN, f'{pid}_{nm}.png'); bpy.ops.render.render(write_still=True)


for pid, fn in PROPS:
    clear(); K = Kit(PAL_OF.get(pid, 'civic')); fn(K); ob = K.join(pid)
    paint(ob, ao_dist=0.08, grad=0.3, grime=0.15, seed=len(pid))
    for o in K.named: o.parent = ob
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    for o in K.named: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, pid + '.glb'), export_format='GLB', use_selection=True)
    render(pid, ob)
    print(f'PROP {pid} tris={tris}')
