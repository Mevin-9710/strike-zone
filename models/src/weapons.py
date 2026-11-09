# Strike Zone weapons. Low-poly, original designs.
# Convention: origin = top of the pistol grip (where the hand closes), barrel along -Y, up +Z, meters.
# Run: blender -b -P weapons.py -- <models_dir> [ids...]
import bpy, sys, math, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from style import paint
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
MODELS, ONLY = argv[0], argv[1:]
OUT = os.path.join(MODELS, 'weapons'); os.makedirs(OUT, exist_ok=True)
REN = os.path.join(MODELS, 'renders', 'weapons'); os.makedirs(REN, exist_ok=True)

PAL = {
    'dark': ((0.035, 0.037, 0.042), 0.55, 0.3), 'metal': ((0.20, 0.21, 0.23), 0.40, 0.8),
    'poly': ((0.09, 0.095, 0.10), 0.75, 0.0), 'tan': ((0.42, 0.34, 0.22), 0.8, 0.0),
    'wood': ((0.30, 0.15, 0.06), 0.6, 0.0), 'olive': ((0.19, 0.21, 0.12), 0.8, 0.0),
    'glass': ((0.15, 0.55, 0.75), 0.1, 0.0), 'accent': ((0.85, 0.55, 0.12), 0.4, 0.6),
}
R = math.radians


def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds):
        for d in list(coll): coll.remove(d)


class Kit:
    def __init__(s, key):
        s.parts, s.magparts, s.M = [], [], {}
        for k, (c, rough, metal) in PAL.items():
            m = bpy.data.materials.new(f'{key}_{k}'); m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']
            b.inputs['Base Color'].default_value = (*c, 1)
            b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
            if k == 'glass':
                b.inputs['Emission Color'].default_value = (*c, 1); b.inputs['Emission Strength'].default_value = 1.5
            s.M[k] = m

    def mag(s):
        s.magparts.append(s.parts.pop())

    def B(s, loc, size, m, bev=0.006, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_cube_add(location=loc, rotation=[R(a) for a in rot]); o = bpy.context.object
        o.scale = [v / 2 for v in size]; bpy.ops.object.transform_apply(scale=True)
        if bev: md = o.modifiers.new('b', 'BEVEL'); md.width = min(bev, min(size) * 0.4); md.segments = 2
        o.data.materials.append(s.M[m]); s.parts.append(o); return o

    def C(s, loc, r, length, m, axis='y', v=12):
        rot = {'y': (R(90), 0, 0), 'x': (0, R(90), 0), 'z': (0, 0, 0)}[axis]
        bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=length, location=loc, rotation=rot)
        o = bpy.context.object; o.data.materials.append(s.M[m]); s.parts.append(o); return o

    def beam(s, p1, p2, r, m):
        a, b = Vector(p1), Vector(p2); d = b - a
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=r, depth=d.length, location=(a + b) / 2)
        o = bpy.context.object; o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        o.data.materials.append(s.M[m]); s.parts.append(o); return o

    # shared sub-assemblies
    def grip(s, m, ang=17, w=0.030, l=0.042, hgt=0.100):
        s.B((0, 0.012, -0.050), (w, l, hgt), m, rot=(ang, 0, 0))

    def trigger(s, m='poly', y=-0.035, length=0.055):
        s.B((0, y, -0.013), (0.011, length, 0.007), m)
        s.B((0, y - length / 2 + 0.004, -0.003), (0.011, 0.008, 0.024), m)
        s.B((0, y + 0.006, -0.006), (0.005, 0.006, 0.016), 'dark')

    def _merge(s, objs, name):
        from mathutils import Matrix
        for o in objs:
            bpy.context.view_layer.objects.active = o
            for md in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
            o.data.transform(Matrix.Diagonal((1.3, 1.0, 1.3, 1)) @ o.matrix_world); o.matrix_world = Matrix()   # chunky toy proportions
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
        ob = bpy.context.object; ob.name = name; return ob

    def join(s, name):
        ob = s._merge(s.parts, name)
        paint(ob, ao_dist=0.05, grad=0.25, grime=0.12, edge=0.15, seed=len(name))
        s.mag_ob = None
        if s.magparts:
            mg = s._merge(s.magparts, 'mag')
            paint(mg, ao_dist=0.05, grad=0.25, grime=0.12, seed=len(name) + 1)
            mg.parent = ob; s.mag_ob = mg
        return ob


# ---------------- pistols ----------------
def vex_p9(K):  # compact striker pistol
    K.B((0, -0.065, 0.012), (0.026, 0.150, 0.024), 'poly')
    K.B((0, -0.070, 0.040), (0.028, 0.170, 0.032), 'metal')
    for i in range(3): K.B((0, 0.004 - i * 0.008, 0.040), (0.0295, 0.003, 0.024), 'dark', 0)
    K.grip('poly', hgt=0.105)
    K.B((0, 0.027, -0.102), (0.028, 0.045, 0.010), 'dark', rot=(17, 0, 0)); K.mag()
    K.trigger()
    K.C((0, -0.156, 0.042), 0.007, 0.006, 'dark')
    K.B((0, -0.148, 0.059), (0.006, 0.008, 0.006), 'dark', 0); K.B((0, 0.002, 0.059), (0.016, 0.008, 0.006), 'dark', 0)
    K.B((0.0145, -0.02, 0.040), (0.001, 0.03, 0.006), 'accent', 0)


def harrow_45(K):  # heavy competition pistol with compensator and light
    K.B((0, -0.080, 0.012), (0.030, 0.180, 0.026), 'tan')
    K.B((0, -0.085, 0.043), (0.032, 0.210, 0.036), 'metal')
    K.B((0, -0.205, 0.043), (0.034, 0.030, 0.038), 'dark')
    K.B((0, -0.205, 0.063), (0.020, 0.012, 0.004), 'poly', 0)
    K.grip('tan', w=0.031, l=0.046, hgt=0.115)
    for x in (-1, 1): K.B((0.016 * x, 0.012, -0.050), (0.002, 0.034, 0.080), 'dark', 0, rot=(17, 0, 0))
    K.B((0, 0.029, -0.108), (0.032, 0.048, 0.010), 'dark', rot=(17, 0, 0)); K.mag()
    K.trigger('tan', y=-0.038)
    K.B((0, -0.135, -0.008), (0.026, 0.050, 0.022), 'dark')
    K.C((0, -0.161, -0.008), 0.008, 0.004, 'glass')
    K.B((0, -0.215, 0.064), (0.006, 0.008, 0.008), 'dark', 0); K.B((0, 0.010, 0.064), (0.018, 0.010, 0.008), 'dark', 0)
    K.B((0.0165, -0.07, 0.043), (0.001, 0.05, 0.006), 'accent', 0)


def bulldog_r6(K):  # six-shot revolver
    K.B((0, -0.025, 0.035), (0.028, 0.085, 0.055), 'metal')
    K.C((0, -0.040, 0.040), 0.025, 0.052, 'metal', v=10); K.mag()
    for a in range(6):
        ang = R(a * 60); K.C((0.017 * math.cos(ang), -0.0655, 0.040 + 0.017 * math.sin(ang)), 0.005, 0.002, 'accent', v=6); K.mag()
    K.C((0, -0.140, 0.057), 0.010, 0.160, 'metal')
    K.B((0, -0.140, 0.040), (0.017, 0.160, 0.016), 'metal')
    K.B((0, -0.212, 0.071), (0.006, 0.014, 0.010), 'dark', 0)
    K.B((0, -0.050, 0.069), (0.020, 0.070, 0.008), 'metal')
    K.B((0, 0.020, 0.066), (0.010, 0.016, 0.018), 'dark', rot=(-30, 0, 0))
    K.B((0, 0.018, -0.045), (0.028, 0.040, 0.100), 'wood', rot=(22, 0, 0))
    K.B((0, 0.037, -0.093), (0.030, 0.046, 0.012), 'wood', rot=(22, 0, 0))
    K.trigger('metal', y=-0.022, length=0.040)


# ---------------- assault rifles ----------------
def ar7_lance(K):  # modular carbine with red dot
    K.B((0, -0.06, 0.012), (0.036, 0.20, 0.040), 'poly')
    K.B((0, -0.06, 0.055), (0.040, 0.22, 0.048), 'dark')
    K.B((0, -0.28, 0.052), (0.046, 0.24, 0.050), 'poly')
    K.B((0, -0.24, 0.081), (0.022, 0.32, 0.008), 'dark', 0)
    K.C((0, -0.47, 0.055), 0.009, 0.16, 'metal'); K.C((0, -0.565, 0.055), 0.014, 0.05, 'dark')
    K.B((0, -0.41, 0.072), (0.012, 0.016, 0.030), 'dark')
    K.C((0, 0.12, 0.050), 0.012, 0.16, 'dark')
    K.B((0, 0.21, 0.040), (0.036, 0.10, 0.070), 'poly'); K.B((0, 0.262, 0.040), (0.038, 0.012, 0.074), 'dark')
    K.grip('poly', ang=18)
    K.B((0, -0.10, -0.060), (0.026, 0.050, 0.120), 'dark', rot=(-10, 0, 0)); K.mag()
    K.B((0, -0.118, -0.126), (0.026, 0.050, 0.040), 'dark', rot=(-24, 0, 0)); K.mag()
    K.trigger('poly', length=0.06)
    K.B((0, -0.03, 0.087), (0.030, 0.050, 0.012), 'dark')
    K.C((0, -0.03, 0.110), 0.018, 0.050, 'dark'); K.C((0, -0.056, 0.110), 0.014, 0.003, 'glass')
    K.B((0.021, -0.06, 0.055), (0.002, 0.06, 0.010), 'accent', 0)


def kestrel_bp(K):  # bullpup: magazine behind the grip
    K.B((0, 0.02, 0.035), (0.044, 0.48, 0.075), 'olive')
    K.B((0, -0.04, 0.098), (0.026, 0.16, 0.030), 'dark'); K.C((0, -0.122, 0.098), 0.012, 0.004, 'glass')
    K.C((0, -0.30, 0.045), 0.009, 0.18, 'metal'); K.C((0, -0.39, 0.045), 0.013, 0.03, 'dark')
    K.B((0, -0.20, 0.020), (0.046, 0.060, 0.060), 'olive')
    K.grip('dark', ang=15)
    K.trigger('dark', y=-0.04, length=0.09)
    K.B((0, 0.10, -0.040), (0.026, 0.050, 0.110), 'dark', rot=(-8, 0, 0)); K.mag()
    K.B((0, 0.265, 0.035), (0.046, 0.012, 0.078), 'dark')
    K.B((0.023, 0.15, 0.055), (0.002, 0.08, 0.012), 'accent', 0)


def warden_br(K):  # wood-stock battle rifle
    K.B((0, -0.05, 0.040), (0.038, 0.24, 0.060), 'metal')
    K.B((0, -0.30, 0.040), (0.046, 0.26, 0.050), 'wood')
    K.C((0, -0.53, 0.050), 0.010, 0.22, 'metal'); K.C((0, -0.645, 0.050), 0.014, 0.04, 'dark')
    K.B((0, -0.62, 0.075), (0.010, 0.012, 0.030), 'dark'); K.B((0, 0.040, 0.080), (0.020, 0.015, 0.018), 'dark')
    K.B((0, 0.20, 0.015), (0.040, 0.26, 0.070), 'wood'); K.B((0, 0.335, 0.005), (0.042, 0.012, 0.100), 'dark')
    K.B((0, 0.05, -0.020), (0.034, 0.08, 0.060), 'wood', rot=(25, 0, 0))
    K.grip('wood', ang=20, hgt=0.090)
    K.B((0, -0.09, -0.050), (0.026, 0.060, 0.110), 'dark'); K.mag()
    K.trigger('metal', length=0.06)
    K.B((0.020, -0.05, 0.050), (0.002, 0.04, 0.012), 'accent', 0)


# ---------------- machine guns ----------------
def grinder_lmg(K):  # belt-fed with box magazine and folded bipod
    K.B((0, -0.06, 0.050), (0.060, 0.30, 0.080), 'dark')
    K.B((0, -0.06, 0.096), (0.056, 0.24, 0.012), 'poly')
    K.B((0, -0.20, 0.130), (0.016, 0.09, 0.012), 'dark')
    for y in (-0.165, -0.235): K.B((0, y, 0.112), (0.012, 0.012, 0.030), 'dark', 0)
    K.C((0, -0.50, 0.055), 0.014, 0.42, 'metal')
    for i in range(4): K.C((0, -0.36 - i * 0.07, 0.055), 0.019, 0.008, 'dark')
    K.C((0, -0.72, 0.055), 0.020, 0.05, 'dark')
    K.B((0, -0.27, 0.035), (0.050, 0.12, 0.060), 'poly')
    K.B((0, -0.10, -0.040), (0.070, 0.090, 0.090), 'olive'); K.mag()
    K.B((0.030, -0.10, 0.030), (0.012, 0.050, 0.040), 'accent', 0)
    K.B((0, 0.20, 0.040), (0.040, 0.22, 0.080), 'poly'); K.B((0, 0.312, 0.040), (0.042, 0.012, 0.084), 'dark')
    K.grip('poly')
    K.trigger('poly', length=0.06)
    for x in (-1, 1): K.B((0.014 * x, -0.45, 0.025), (0.008, 0.20, 0.008), 'dark', 0)


def hailstorm_mg(K):  # drum-fed, shrouded barrel, foregrip
    K.B((0, -0.04, 0.050), (0.056, 0.26, 0.075), 'metal')
    K.C((0, -0.40, 0.055), 0.030, 0.40, 'dark', v=10)
    for i in range(5): K.B((0, -0.25 - i * 0.07, 0.086), (0.030, 0.030, 0.006), 'poly', 0)
    K.C((0, -0.625, 0.055), 0.012, 0.05, 'metal')
    K.C((0, -0.06, -0.060), 0.062, 0.052, 'olive', axis='x', v=16); K.mag()
    K.C((0.027, -0.06, -0.060), 0.030, 0.004, 'accent', axis='x', v=16); K.mag()
    K.B((0, -0.32, -0.020), (0.026, 0.030, 0.080), 'poly')
    K.B((0, 0.18, 0.070), (0.030, 0.20, 0.016), 'dark'); K.B((0, 0.18, 0.000), (0.030, 0.20, 0.016), 'dark')
    K.B((0, 0.28, 0.035), (0.040, 0.012, 0.090), 'dark')
    K.grip('poly')
    K.trigger('poly', length=0.06)
    K.B((0, -0.05, 0.105), (0.034, 0.060, 0.040), 'dark'); K.B((0, -0.05, 0.115), (0.024, 0.004, 0.024), 'glass', 0)


# ---------------- sniper rifles ----------------
def scope(K, y0, z, r, length, bell):
    K.C((0, y0, z), r, length, 'dark')
    K.C((0, y0 - length / 2, z), bell, 0.07, 'dark'); K.C((0, y0 - length / 2 - 0.036, z), bell * 0.85, 0.004, 'glass')
    K.C((0, y0 + length / 2, z), r * 1.35, 0.05, 'dark')
    K.C((0, y0, z + r + 0.008), 0.011, 0.02, 'dark', axis='z')
    K.C((0, y0 - length / 2 + 0.04, z), bell * 1.02, 0.006, 'accent')
    for dy in (-length * 0.3, length * 0.3): K.B((0, y0 + dy, z - r - 0.012), (0.020, 0.020, 0.026), 'dark', 0)


def longshot_bolt(K):  # bolt-action marksman rifle
    K.C((0, -0.02, 0.050), 0.018, 0.22, 'metal')
    K.C((0, -0.45, 0.050), 0.010, 0.64, 'metal'); K.B((0, -0.78, 0.050), (0.030, 0.040, 0.024), 'dark')
    K.B((0, -0.20, 0.020), (0.050, 0.36, 0.050), 'tan')
    K.B((0, 0.20, 0.015), (0.045, 0.26, 0.075), 'tan')
    K.B((0, 0.02, -0.040), (0.032, 0.050, 0.090), 'tan', rot=(20, 0, 0))
    K.B((0, 0.18, 0.060), (0.040, 0.14, 0.020), 'dark'); K.B((0, 0.336, 0.015), (0.047, 0.012, 0.080), 'dark')
    scope(K, -0.05, 0.115, 0.016, 0.30, 0.026)
    K.B((0.030, 0.06, 0.055), (0.040, 0.010, 0.010), 'metal'); K.B((0.052, 0.06, 0.055), (0.016, 0.016, 0.016), 'dark')
    K.B((0, -0.05, -0.020), (0.028, 0.060, 0.050), 'dark'); K.mag()
    K.trigger('tan', length=0.05)


def javelin_amr(K):  # anti-materiel rifle with deployed bipod
    K.B((0, -0.04, 0.050), (0.060, 0.34, 0.080), 'dark')
    K.C((0, -0.60, 0.055), 0.016, 0.80, 'metal')
    K.B((0, -1.02, 0.055), (0.070, 0.070, 0.050), 'dark'); K.B((0, -1.02, 0.055), (0.074, 0.020, 0.030), 'poly', 0)
    K.B((0, -0.32, 0.050), (0.070, 0.22, 0.070), 'olive')
    for x in (-1, 1):
        K.beam((0.02 * x, -0.40, 0.020), (0.09 * x, -0.47, -0.20), 0.008, 'dark')
        K.B((0.09 * x, -0.47, -0.205), (0.030, 0.030, 0.010), 'dark', 0)
    K.B((0, 0.24, 0.040), (0.050, 0.28, 0.090), 'olive')
    K.B((0, 0.33, -0.050), (0.014, 0.014, 0.090), 'dark', 0); K.B((0, 0.386, 0.040), (0.052, 0.012, 0.094), 'dark')
    K.grip('dark', w=0.034)
    K.trigger('dark', length=0.06)
    K.B((0, -0.12, -0.050), (0.040, 0.080, 0.120), 'dark'); K.mag()
    scope(K, -0.06, 0.135, 0.020, 0.34, 0.032)
    K.B((0.031, -0.04, 0.060), (0.002, 0.10, 0.014), 'accent', 0)


WEAPONS = [
    # id, display name, class, builder, clip used to hold it
    ('vex_p9', 'Vex P9', 'pistol', vex_p9, 'shoot_pistol'),
    ('harrow_45', 'Harrow .45', 'pistol', harrow_45, 'shoot_pistol'),
    ('bulldog_r6', 'Bulldog R6', 'revolver', bulldog_r6, 'shoot_pistol'),
    ('ar7_lance', 'AR-7 Lance', 'assault', ar7_lance, 'shoot'),
    ('kestrel_bp', 'Kestrel', 'assault', kestrel_bp, 'shoot'),
    ('warden_br', 'Warden', 'assault', warden_br, 'shoot'),
    ('grinder_lmg', 'Grinder', 'machine gun', grinder_lmg, 'shoot'),
    ('hailstorm_mg', 'Hailstorm', 'machine gun', hailstorm_mg, 'shoot'),
    ('longshot_bolt', 'Longshot', 'sniper', longshot_bolt, 'shoot'),
    ('javelin_amr', 'Javelin', 'sniper', javelin_amr, 'shoot'),
]


def render(wid, ob):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 640, 300
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.16, 0.18, 0.22, 1); sc.world = w
    bpy.ops.object.light_add(type='SUN'); s = bpy.context.object; s.data.energy = 3.5
    s.rotation_euler = (R(40), R(15), R(60))
    bpy.ops.object.light_add(type='AREA', location=(-1, 1, 1)); a = bpy.context.object; a.data.energy = 40; a.data.size = 2
    a.rotation_euler = (R(-45), R(-30), 0)
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ctr, span = (lo + hi) / 2, hi.y - lo.y
    aspect = sc.render.resolution_x / sc.render.resolution_y
    bpy.ops.object.empty_add(location=ctr); tgt = bpy.context.object
    bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'
    con = cam.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    views = [('side', Vector((3, 0, 0)), max(span, (hi.z - lo.z) * aspect) * 1.12),
             ('three', Vector((2.0, -1.6, 1.3)), max(span, (hi.z - lo.z) * aspect) * 1.0)]
    for nm, off, scale in views:
        cam.location = ctr + off; cam.data.ortho_scale = scale
        sc.render.filepath = os.path.join(REN, f'{wid}_{nm}.png'); bpy.ops.render.render(write_still=True)
    return span


meta = []
for wid, name, cls, fn, clip in WEAPONS:
    if ONLY and wid not in ONLY: continue
    clear(); K = Kit(wid); fn(K); ob = K.join(wid)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    if K.mag_ob: K.mag_ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, wid + '.glb'), export_format='GLB', use_selection=True)
    span = render(wid, ob)
    meta.append({'id': wid, 'name': name, 'class': cls, 'clip': clip, 'length_m': round(span, 3), 'tris': tris})
    print(f'WPN {wid} tris={tris} len={span:.2f}')
if not ONLY:
    json.dump(meta, open(os.path.join(OUT, 'weapons.json'), 'w'), indent=2)
