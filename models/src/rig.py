# Rig + animate Strike Zone characters.
# Rigid skinning: every low-poly part is weighted 100% to one bone, so nothing stretches.
# Run (export):  blender -b -P rig.py -- export  <models_dir> [names...]
# Run (preview): blender -b -P rig.py -- preview <models_dir> <out_dir> [names...]
import bpy, sys, math, os
from mathutils import Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
MODE, MODELS = argv[0], argv[1]
PREVIEW_OUT = argv[2] if MODE == 'preview' else None
ONLY = argv[3:] if MODE == 'preview' else argv[2:]

HUMANOIDS = {  # file stem: (height scale, bulk)
    'rhea': (1.00, 1.00), 'kade': (1.06, 1.25), 'yuna': (0.96, 0.90), 'tomas': (1.02, 1.10), 'amara': (1.08, 0.95),
    'enemy_guard': (1.0, 1.0), 'enemy_sniper': (1.0, 1.0), 'enemy_heavy': (1.0, 1.35), 'enemy_commander': (1.0, 1.05),
}
MECHS = ('enemy_drone', 'enemy_turret')
AX = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}
ROTOR_XY = [(0.30 * math.cos(math.radians(a)), 0.30 * math.sin(math.radians(a))) for a in (45, 135, 225, 315)]


def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions,
                 bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.images):
        for d in list(coll): coll.remove(d)


def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def import_parts(path):
    bpy.ops.import_scene.gltf(filepath=path)
    mesh = [o for o in bpy.context.selected_objects if o.type == 'MESH'][0]
    select_only([mesh])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    return [o for o in bpy.context.selected_objects if o.type == 'MESH']


def centroid(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return sum(vs, Vector()) / len(vs)


# ---------------- classification (normalized T-pose coords) ----------------
def classify_humanoid(c, h, B):
    x, y, z = c.x / h, c.y / h, c.z / h
    X, side = abs(x), ('L' if x > 0 else 'R')
    sx = 0.25 * B
    if 1.30 <= z <= 1.56 and X > sx + 0.08:
        if X < sx + 0.30: return f'upper_arm.{side}'
        if X < sx + 0.53: return f'forearm.{side}'
        return f'hand.{side}'
    if 1.30 <= z <= 1.60 and sx - 0.07 <= X <= sx + 0.08 and z < 1.525:
        return 'chest'   # shoulder caps and pads ride the torso like real armor
    if z >= 1.53 and X < 0.16: return 'head'
    if z < 0.95 and X > 0.02:
        if z < 0.15: return f'foot.{side}'
        if z < 0.535: return f'shin.{side}'
        return f'thigh.{side}'
    return 'hips' if z < 1.10 else 'chest'


def classify_drone(c):
    if c.z > 1.44:
        for i, (rx, ry) in enumerate(ROTOR_XY):
            if math.hypot(c.x - rx, c.y - ry) < 0.15: return f'rotor{i}'
    return 'body'


def classify_turret(c):
    if c.z < 0.55: return 'base'
    return 'barrels' if c.y < -0.30 else 'head'


# ---------------- skeletons ----------------
def humanoid_bones(h, B):
    sx, lx = 0.25 * B, 0.11 * B
    b = {
        'hips': ((0, 0, 0.95), (0, 0, 1.12), None),
        'chest': ((0, 0, 1.12), (0, 0, 1.50), 'hips'),
        'head': ((0, 0, 1.53), (0, 0, 1.82), 'chest'),
    }
    for s, k in (('L', 1), ('R', -1)):
        b[f'upper_arm.{s}'] = ((k * sx, 0, 1.42), (k * (sx + 0.30), 0, 1.42), 'chest')
        b[f'forearm.{s}'] = ((k * (sx + 0.30), 0, 1.42), (k * (sx + 0.55), 0, 1.42), f'upper_arm.{s}')
        b[f'hand.{s}'] = ((k * (sx + 0.55), 0, 1.42), (k * (sx + 0.66), 0, 1.42), f'forearm.{s}')
        b[f'thigh.{s}'] = ((k * lx, 0, 0.93), (k * lx, 0, 0.535), 'hips')
        b[f'shin.{s}'] = ((k * lx, 0, 0.535), (k * lx, 0, 0.12), f'thigh.{s}')
        b[f'foot.{s}'] = ((k * lx, 0, 0.12), (k * lx, -0.14, 0.12), f'shin.{s}')
    return {n: (Vector(hd) * h, Vector(tl) * h, p) for n, (hd, tl, p) in b.items()}


def drone_bones():
    b = {'body': ((0, 0, 1.30), (0, 0, 1.55), None)}
    for i, (x, y) in enumerate(ROTOR_XY):
        b[f'rotor{i}'] = ((x, y, 1.44), (x, y, 1.56), 'body')
    return {n: (Vector(a), Vector(t), p) for n, (a, t, p) in b.items()}


def turret_bones():
    b = {'base': ((0, 0, 0.0), (0, 0, 0.50), None),
         'head': ((0, 0, 0.55), (0, 0, 0.95), 'base'),
         'barrels': ((0, -0.25, 0.74), (0, -0.65, 0.74), 'head')}
    return {n: (Vector(a), Vector(t), p) for n, (a, t, p) in b.items()}


def build_rig(name, parts, classify, bones):
    for o in parts:
        bone = classify(centroid(o))
        vg = o.vertex_groups.new(name=bone)
        vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    select_only(parts); bpy.ops.object.join()
    mesh = bpy.context.object; mesh.name = name
    arm = bpy.data.armatures.new(name + '_rig')
    rig = bpy.data.objects.new(name + '_rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    select_only([rig]); bpy.ops.object.mode_set(mode='EDIT')
    for n, (hd, tl, _) in bones.items():
        eb = arm.edit_bones.new(n); eb.head, eb.tail, eb.roll = hd, tl, 0
    for n, (_, _, p) in bones.items():
        if p: arm.edit_bones[n].parent = arm.edit_bones[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    mesh.parent = rig
    mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ' if pb.name.startswith('rotor') else 'QUATERNION'
    used = {g.name for g in mesh.vertex_groups}
    return rig, mesh, used


# ---------------- posing ----------------
def apply_pose(rig, pose):
    for pb in rig.pose.bones:
        spec = pose.get(pb.name, {})
        R = pb.bone.matrix_local.to_quaternion()
        q = Quaternion()
        for ax, deg in spec.get('r', []):
            q = Quaternion(AX[ax], math.radians(deg)) @ q
        if 'q' in spec: q = spec['q'] @ q
        if pb.rotation_mode == 'QUATERNION':
            pb.rotation_quaternion = R.inverted() @ q @ R
        else:
            pb.rotation_euler = spec.get('e', (0, 0, 0))
        pb.location = R.inverted() @ Vector(spec.get('l', (0, 0, 0)))


def insert_keys(rig, frame, pose):
    apply_pose(rig, pose)
    prefs = bpy.context.preferences.edit
    for pb in rig.pose.bones:
        rotor = pb.name.startswith('rotor')
        prefs.keyframe_new_interpolation_type = 'LINEAR' if rotor else 'BEZIER'
        pb.keyframe_insert('rotation_euler' if rotor else 'rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)
    prefs.keyframe_new_interpolation_type = 'BEZIER'


def make_action(rig, name, keys):
    ad = rig.animation_data or rig.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    for f, pose in keys: insert_keys(rig, f, pose)
    act.use_fake_user = True
    tr = ad.nla_tracks.new(); tr.name = name
    tr.strips.new(name, int(keys[0][0]), act)
    ad.action = None
    return act


def ik_arm(side, target, pole, h, B):
    """Analytic two-bone IK. target = wrist position in normalized T-pose space (chest frame).
    Returns armature-space deltas for upper_arm and forearm (forearm delta is relative to the posed upper arm)."""
    k = 1 if side == 'L' else -1
    S = Vector((k * 0.25 * B, 0, 1.42)) * h
    L1, L2 = 0.30 * h, 0.25 * h
    T = Vector(target) * h
    d = T - S
    if d.length > (L1 + L2) * 1.08:
        print(f'IKWARN {side} reach {d.length / h:.3f} > {(L1 + L2) / h:.3f}')
    dist = min(d.length, (L1 + L2) * 0.995)
    dn = d.normalized()
    a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
    hh = math.sqrt(max(L1 * L1 - a * a, 0.0))
    P = Vector(pole)
    perp = (P - dn * P.dot(dn)).normalized()
    E = S + dn * a + perp * hh
    W = S + dn * dist
    u, f = (E - S).normalized(), (W - E).normalized()
    q_u = Vector((k, 0, 0)).rotation_difference(u)
    q_f = q_u.inverted() @ u.rotation_difference(f) @ q_u
    return q_u, q_f


def two_hand(h, B, right, left, kick=0.0, poleR=(-0.12, 0.05, -1.0), poleL=(0.12, 0.05, -1.0)):
    """Arms override placing the right wrist and left wrist on targets (recoil pushes both back and up)."""
    off = Vector((0, kick * 0.045, kick * 0.02))
    uR, fR = ik_arm('R', Vector(right) + off, poleR, h, B)
    uL, fL = ik_arm('L', Vector(left) + off, poleL, h, B)
    return {'upper_arm.R': {'q': uR}, 'forearm.R': {'q': fR},
            'upper_arm.L': {'q': uL}, 'forearm.L': {'q': fL}}


def hp(lt=0, ls=0, rt=0, rs=0, la=0, ra=0, le=10, re=10, down=78, dz=0.0, lean=0, twist=0,
       head=0, headz=0, hipsrx=0, arms=None):
    """Humanoid pose. Angles in degrees, armature-space deltas.
    lt/rt thigh swing (neg = forward), ls/rs knee bend, la/ra arm swing (neg = forward),
    le/re elbow bend, down = arms lowered from T-pose, lean (pos = forward), twist (pos = right shoulder forward)."""
    p = {
        'thigh.L': {'r': [('X', lt)]}, 'shin.L': {'r': [('X', ls)]}, 'foot.L': {'r': [('X', -(lt + ls))]},
        'thigh.R': {'r': [('X', rt)]}, 'shin.R': {'r': [('X', rs)]}, 'foot.R': {'r': [('X', -(rt + rs))]},
        'upper_arm.L': {'r': [('Y', down), ('X', la)]}, 'upper_arm.R': {'r': [('Y', -down), ('X', ra)]},
        'forearm.L': {'r': [('Z', -le)]}, 'forearm.R': {'r': [('Z', re)]},
        'chest': {'r': [('X', lean), ('Z', twist)]},
        'head': {'r': [('X', head), ('Z', headz)]},
        'hips': {'r': [('X', hipsrx)], 'l': (0, 0, dz)},
    }
    if arms: p.update(arms)
    return p


def humanoid_clips(rig, h, B):
    s = h  # scale vertical offsets with height
    idle0 = hp(lt=-3, rt=3, down=80, le=8, re=8)
    idle1 = hp(lt=-3, rt=3, down=77, le=11, re=11, lean=-1.5, head=1.5, dz=0.006 * s)
    make_action(rig, 'idle', [(0, idle0), (24, idle1), (48, idle0)])

    w0 = hp(lt=-24, ls=6, rt=18, rs=16, la=18, ra=-18, le=12, re=22, dz=-0.025 * s, lean=4, twist=5, headz=-4)
    w6 = hp(lt=0, ls=4, rt=-12, rs=42, le=12, re=12, dz=0.012 * s, lean=4)
    w12 = hp(lt=18, ls=16, rt=-24, rs=6, la=-18, ra=18, le=22, re=12, dz=-0.025 * s, lean=4, twist=-5, headz=4)
    w18 = hp(lt=-12, ls=42, rt=0, rs=4, le=12, re=12, dz=0.012 * s, lean=4)
    make_action(rig, 'walk', [(0, w0), (6, w6), (12, w12), (18, w18), (24, w0)])

    r0 = hp(lt=-38, ls=14, rt=30, rs=40, la=35, ra=-35, le=85, re=85, dz=-0.04 * s, lean=14, twist=8, head=-10, headz=-6)
    r4 = hp(lt=10, ls=20, rt=-50, rs=100, le=85, re=85, dz=0.03 * s, lean=14, head=-10)
    r8 = hp(lt=30, ls=40, rt=-38, rs=14, la=-35, ra=35, le=85, re=85, dz=-0.04 * s, lean=14, twist=-8, head=-10, headz=6)
    r12 = hp(lt=-50, ls=100, rt=10, rs=20, le=85, re=85, dz=0.03 * s, lean=14, head=-10)
    make_action(rig, 'run', [(0, r0), (4, r4), (8, r8), (12, r12), (16, r0)])

    RIFLE_R, RIFLE_L = (-0.07, -0.25, 1.25), (-0.03, -0.43, 1.27)   # grip hand, handguard hand
    PISTOL_R, PISTOL_L = (-0.03, -0.44, 1.37), (0.00, -0.42, 1.35)  # both hands wrapped on the pistol
    def aim(R, L, kick=0.0):
        return hp(lt=-10, ls=8, rt=10, rs=8, lean=2 - 5 * kick, twist=6, headz=-6, head=3 * kick,
                  arms=two_hand(h, B, R, L, kick))
    make_action(rig, 'shoot', [(0, aim(RIFLE_R, RIFLE_L)), (2, aim(RIFLE_R, RIFLE_L, 1)),
                               (7, aim(RIFLE_R, RIFLE_L)), (12, aim(RIFLE_R, RIFLE_L))])
    make_action(rig, 'shoot_pistol', [(0, aim(PISTOL_R, PISTOL_L)), (2, aim(PISTOL_R, PISTOL_L, 1.3)),
                                      (8, aim(PISTOL_R, PISTOL_L)), (14, aim(PISTOL_R, PISTOL_L))])

    # ---------- shared helpers for armed / kneeling / ability poses ----------
    Xv, Zv = Vector((1, 0, 0)), Vector((0, 0, 1))
    def chestq(lean, twist): return Quaternion(Zv, math.radians(twist)) @ Quaternion(Xv, math.radians(lean))
    def Wq(pitch, yaw): return Quaternion(Zv, math.radians(yaw)) @ Quaternion(Xv, math.radians(pitch))
    def hand_final(arms, lean, twist): return chestq(lean, twist) @ arms['upper_arm.R']['q'] @ arms['forearm.R']['q']
    def aim_frame(R, L):
        arms = two_hand(h, B, R, L)
        return hand_final(arms, 2, 6), chestq(2, 6) @ (Vector(L) - Vector(R))
    F_RIFLE, LW_RIFLE = aim_frame(RIFLE_R, RIFLE_L)
    F_PISTOL, LW_PISTOL = aim_frame(PISTOL_R, PISTOL_L)

    def carry(kind, R, pitch, yaw, lean=0, twist=0, **legs):
        """Weapon held so its world rotation is exactly W(pitch down, yaw left); support hand stays on the handguard."""
        F, Lw = (F_RIFLE, LW_RIFLE) if kind == 'rifle' else (F_PISTOL, LW_PISTOL)
        W = Wq(pitch, yaw)
        L = Vector(R) + chestq(lean, twist).inverted() @ (W @ Lw)
        arms = two_hand(h, B, R, tuple(L))
        arms['hand.R'] = {'q': hand_final(arms, lean, twist).inverted() @ W @ F}
        return hp(lean=lean, twist=twist, arms=arms, **legs)

    WALK_LEGS = [(0, dict(lt=-24, ls=6, rt=18, rs=16, dz=-0.025 * s, headz=-2), 2, 0),
                 (6, dict(lt=0, ls=4, rt=-12, rs=42, dz=0.012 * s), 0, 1),
                 (12, dict(lt=18, ls=16, rt=-24, rs=6, dz=-0.025 * s, headz=2), -2, 0),
                 (18, dict(lt=-12, ls=42, rt=0, rs=4, dz=0.012 * s), 0, 1),
                 (24, dict(lt=-24, ls=6, rt=18, rs=16, dz=-0.025 * s, headz=-2), 2, 0)]
    RUN_LEGS = [(0, dict(lt=-38, ls=14, rt=30, rs=40, dz=-0.04 * s, head=-10), 4, 0),
                (4, dict(lt=10, ls=20, rt=-50, rs=100, dz=0.03 * s, head=-10), 0, 1),
                (8, dict(lt=30, ls=40, rt=-38, rs=14, dz=-0.04 * s, head=-10), -4, 0),
                (12, dict(lt=-50, ls=100, rt=10, rs=20, dz=0.03 * s, head=-10), 0, 1),
                (16, dict(lt=-38, ls=14, rt=30, rs=40, dz=-0.04 * s, head=-10), 4, 0)]
    CARRY = {'rifle': (((-0.10, -0.20, 1.15), 28, 22), ((-0.10, -0.22, 1.22), 15, 35)),
             'pistol': (((-0.03, -0.30, 1.12), 45, 0), ((-0.05, -0.24, 1.18), 55, 10))}
    for kind, ((R, p, y), (R2, p2, y2)) in CARRY.items():
        make_action(rig, f'idle_{kind}', [(0, carry(kind, R, p, y, lean=2, twist=4, lt=-3, rt=3)),
                                          (24, carry(kind, R, p + 2, y, lean=0.5, twist=4, lt=-3, rt=3, dz=0.006 * s, head=1.5)),
                                          (48, carry(kind, R, p, y, lean=2, twist=4, lt=-3, rt=3))])
        make_action(rig, f'walk_{kind}', [(f, carry(kind, R, p + 2 * sw, y, lean=4, twist=4 + tw, **lg)) for f, lg, tw, sw in WALK_LEGS])
        make_action(rig, f'run_{kind}', [(f, carry(kind, R2, p2 + 3 * sw, y2, lean=14, twist=4 + tw, **lg)) for f, lg, tw, sw in RUN_LEGS])

    # world-space hand targets (normalized units) -> chest-rest frame for IK
    PIV = Vector((0, 0, 1.12))
    def to_chest(Tw, dzn, lean, twist):
        return tuple(PIV + chestq(lean, twist).inverted() @ (Vector(Tw) - PIV - Vector((0, 0, dzn))))
    def pose(Rc=None, Lc=None, Rw=None, Lw=None, lean=0, twist=0, dzn=0.0, poleR=(-0.12, 0.05, -1.0),
             poleL=(0.12, 0.05, -1.0), **kw):
        R = Rc if Rc else to_chest(Rw, dzn, lean, twist)
        L = Lc if Lc else to_chest(Lw, dzn, lean, twist)
        return hp(lean=lean, twist=twist, dz=dzn * s, arms=two_hand(h, B, R, L, poleR=poleR, poleL=poleL), **kw)
    READY_R, READY_L = (-0.20, -0.14, 1.08), (0.20, -0.14, 1.08)
    STAND = dict(lt=-3, rt=3)
    ready = pose(READY_R, READY_L, **STAND)
    KNEEL = dict(lt=-85, ls=90, rt=-5, rs=88)
    SQUAT = dict(lt=-70, ls=110, rt=-70, rs=110)

    # ---------- plant (one-shot) and defuse (loop): kneel, hands on the device ----------
    def onbox(dr=0.0, dl=0.0, lean=55, **kw):
        return pose(Rw=(-0.09, -0.48, 0.30 + dr), Lw=(0.09, -0.48, 0.30 + dl), lean=lean, dzn=-0.50, head=18, **KNEEL, **kw)
    make_action(rig, 'plant', [
        (0, ready),
        (10, pose((-0.08, -0.30, 1.15), (0.08, -0.30, 1.15), lean=20, dzn=-0.50, head=8, **KNEEL)),
        (18, onbox()), (24, onbox(dr=0.06)), (29, onbox(dl=0.06)), (34, onbox(dr=0.06)), (39, onbox(dl=0.05)),
        (44, onbox()),
        (52, pose((-0.10, -0.26, 1.12), (0.10, -0.26, 1.12), lean=25, dzn=-0.50, head=5, **KNEEL)),
        (62, ready)])
    make_action(rig, 'defuse', [(0, onbox()), (6, onbox(dr=0.05)), (12, onbox(dl=0.05, twist=-3)),
                                (18, onbox(dr=0.04, twist=3)), (24, onbox())])

    # ---------- abilities ----------
    up_out_R, up_out_L = (-1.0, 0.3, 0.3), (1.0, 0.3, 0.3)
    make_action(rig, 'ab_smoke', [  # overhand lob
        (0, ready),
        (7, pose((-0.32, 0.20, 1.70), (0.28, -0.35, 1.42), lean=-6, twist=-18, poleR=up_out_R, lt=-14, ls=6, rt=8, rs=8)),
        (12, pose((-0.14, -0.42, 1.62), (0.25, -0.05, 1.15), lean=8, twist=15, poleR=up_out_R, lt=-18, ls=10, rt=10, rs=14)),
        (18, pose((0.02, -0.32, 1.05), (0.27, 0.08, 1.10), lean=16, twist=22, lt=-18, ls=12, rt=12, rs=18)),
        (28, ready)])
    make_action(rig, 'ab_flash', [  # quick sidearm flick, look away and shield the eyes
        (0, ready),
        (5, pose((-0.48, 0.08, 1.36), (0.06, -0.18, 1.72), twist=-22, poleR=(-0.3, 0.5, -1.0), poleL=(0.6, 0.0, -0.4), **STAND)),
        (8, pose((-0.08, -0.52, 1.38), (0.06, -0.18, 1.72), twist=14, headz=35, head=-5, poleL=(0.6, 0.0, -0.4), **STAND)),
        (12, pose((0.12, -0.30, 1.18), (0.06, -0.18, 1.70), twist=18, headz=30, poleL=(0.6, 0.0, -0.4), **STAND)),
        (20, ready)])
    make_action(rig, 'ab_decoy', [  # underhand bowl along the floor
        (0, ready),
        (8, pose((-0.28, 0.28, 1.00), (0.25, -0.30, 1.20), lean=18, dzn=-0.10, lt=-25, ls=35, rt=10, rs=30)),
        (14, pose((-0.14, -0.44, 0.92), (0.26, 0.05, 1.10), lean=22, dzn=-0.10, lt=-25, ls=35, rt=10, rs=30)),
        (20, pose((-0.12, -0.48, 1.35), (0.26, 0.05, 1.10), lean=8, dzn=-0.04, lt=-15, ls=15, rt=8, rs=12)),
        (28, ready)])
    make_action(rig, 'ab_sensor', [  # squat and plant a sensor on the floor
        (0, ready),
        (10, pose(Rw=(-0.12, -0.45, 0.30), Lw=(0.18, -0.30, 0.55), lean=65, dzn=-0.44, head=20, **SQUAT)),
        (18, pose(Rw=(-0.12, -0.45, 0.32), Lw=(0.18, -0.30, 0.55), lean=62, dzn=-0.44, head=20, **SQUAT)),
        (30, ready)])
    make_action(rig, 'ab_shield', [  # raise the wrist emitter into a guard
        (0, ready),
        (6, pose((-0.26, 0.06, 1.08), (0.04, -0.32, 1.55), lean=-5, dzn=-0.02, poleL=(0.8, 0.0, -0.5), lt=-12, ls=10, rt=10, rs=10)),
        (16, pose((-0.26, 0.06, 1.08), (0.05, -0.33, 1.57), lean=-3, dzn=-0.02, poleL=(0.8, 0.0, -0.5), lt=-12, ls=10, rt=10, rs=10)),
        (24, ready)])
    make_action(rig, 'ab_dash', [  # coil, explode forward, recover
        (0, ready),
        (3, pose((-0.22, 0.05, 1.05), (0.22, 0.05, 1.05), lean=18, dzn=-0.08, lt=-10, ls=30, rt=10, rs=30)),
        (7, pose((-0.30, 0.30, 1.10), (0.30, 0.30, 1.10), lean=32, dzn=-0.04, lt=-45, ls=25, rt=35, rs=45)),
        (11, pose((-0.28, 0.25, 1.10), (0.28, 0.25, 1.10), lean=26, dzn=-0.02, lt=30, ls=40, rt=-40, rs=20)),
        (18, ready)])
    make_action(rig, 'ab_lockdown', [  # jump-slam both fists into the ground
        (0, ready),
        (8, pose((-0.12, -0.12, 1.90), (0.12, -0.12, 1.90), lean=-8, dzn=0.03, head=-10, poleR=up_out_R, poleL=up_out_L, **STAND)),
        (14, pose(Rw=(-0.10, -0.45, 0.30), Lw=(0.10, -0.45, 0.30), lean=65, dzn=-0.44, head=20, **SQUAT)),
        (22, pose(Rw=(-0.10, -0.45, 0.31), Lw=(0.10, -0.45, 0.31), lean=63, dzn=-0.44, head=18, **SQUAT)),
        (32, ready)])
    make_action(rig, 'ab_drone', [  # cradle, launch upward, point it forward
        (0, ready),
        (6, pose((-0.08, -0.24, 1.30), (0.02, -0.26, 1.25), **STAND)),
        (12, pose((-0.14, -0.22, 1.94), (0.22, -0.15, 1.10), lean=-10, head=-20, poleR=up_out_R, **STAND)),
        (20, pose((-0.18, -0.52, 1.55), (0.22, -0.15, 1.10), twist=8, **STAND)),
        (28, ready)])

    d5 = hp(lt=5, ls=10, rt=-5, rs=10, down=50, le=30, re=30, lean=-18, head=-25, dz=0.02 * s)
    d16 = hp(lt=-55, ls=100, rt=-50, rs=95, down=60, le=40, re=40, lean=25, head=15, dz=-0.35 * s)
    d28 = hp(lt=-10, ls=10, rt=0, rs=15, down=20, le=20, re=20, lean=5, head=-20, hipsrx=80, dz=-0.78 * s)
    d40 = hp(lt=-10, ls=12, rt=0, rs=16, down=18, le=22, re=22, lean=4, head=-15, hipsrx=82, dz=-0.79 * s)
    make_action(rig, 'death', [(0, idle0), (5, d5), (16, d16), (28, d28), (40, d40)])


def drone_clips(rig):
    T = 2 * math.pi
    def dp(dz=0.0, rx=0, rz=0, turns=0.0, ry=0):
        p = {'body': {'r': [('X', rx), ('Y', ry), ('Z', rz)], 'l': (0, 0, dz)}}
        for i in range(4):
            p[f'rotor{i}'] = {'e': (0, (turns if i % 2 == 0 else -turns) * T, 0)}
        return p
    make_action(rig, 'hover', [(0, dp(dz=-0.04, rx=3, turns=0)), (24, dp(dz=0.04, rx=-3, turns=3)),
                               (48, dp(dz=-0.04, rx=3, turns=6))])
    make_action(rig, 'fire', [(0, dp(turns=0)), (2, dp(rx=-9, dz=0.01, turns=0.5)), (12, dp(turns=3))])
    make_action(rig, 'death', [(0, dp(turns=0)), (8, dp(dz=-0.30, rx=25, rz=40, turns=1.6)),
                               (20, dp(dz=-1.20, rx=70, rz=120, ry=15, turns=2.3)),
                               (36, dp(dz=-1.22, rx=72, rz=124, ry=15, turns=2.4))])


def turret_clips(rig):
    def tp(yaw=0, pitch=0, recoil=0.0, sag=0.0):
        return {'head': {'r': [('X', pitch), ('Z', yaw)], 'l': (0, 0, -sag)},
                'barrels': {'l': (0, recoil, 0)}}
    make_action(rig, 'idle', [(0, tp(yaw=-35, pitch=-2)), (48, tp(yaw=35, pitch=2)), (96, tp(yaw=-35, pitch=-2))])
    make_action(rig, 'fire', [(0, tp()), (1, tp(pitch=-4, recoil=0.08)), (8, tp())])
    make_action(rig, 'death', [(0, tp()), (6, tp(pitch=8, yaw=15)), (18, tp(pitch=35, yaw=20, sag=0.08)),
                               (30, tp(pitch=36, yaw=24, sag=0.09))])


# ---------------- build one character ----------------
def build(stem):
    clear()
    parts = import_parts(os.path.join(MODELS, stem + '.glb'))
    if stem == 'enemy_drone':
        rig, mesh, used = build_rig(stem, parts, classify_drone, drone_bones()); drone_clips(rig)
    elif stem == 'enemy_turret':
        rig, mesh, used = build_rig(stem, parts, classify_turret, turret_bones()); turret_clips(rig)
    else:
        h, B = HUMANOIDS[stem]
        rig, mesh, used = build_rig(stem, parts, lambda c: classify_humanoid(c, h, B), humanoid_bones(h, B))
        humanoid_clips(rig, h, B)
    return rig, mesh, used


def export(stem, rig, mesh):
    out = os.path.join(MODELS, 'rigged'); os.makedirs(out, exist_ok=True)
    select_only([rig, mesh], rig)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, stem + '.glb'), export_format='GLB', use_selection=True,
                              export_animations=True, export_animation_mode='ACTIONS', export_skins=True,
                              export_force_sampling=True, export_def_bones=False)


def preview(stem, rig):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 8; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 220
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.14, 0.16, 0.20, 1); sc.world = w
    bpy.ops.object.light_add(type='SUN', location=(2, -3, 4)); s = bpy.context.object
    s.rotation_euler = (math.radians(45), math.radians(10), math.radians(35)); s.data.energy = 3.5
    bpy.ops.mesh.primitive_plane_add(size=8)
    bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam; cam.data.type = 'ORTHO'
    if stem == 'enemy_drone': cam.data.ortho_scale, zc = 2.2, 0.85
    elif stem == 'enemy_turret': cam.data.ortho_scale, zc = 1.7, 0.5
    else: cam.data.ortho_scale, zc = 2.5, 0.95
    cam.location = (4.2, -4.2, zc + 0.9); cam.rotation_euler = (math.radians(78), 0, math.radians(45))
    ad = rig.animation_data; ad.use_nla = False
    nframes = {'plant': 8, 'defuse': 6, 'shoot_pistol': 6, 'idle': 6, 'walk': 8, 'run': 8, 'shoot': 6, 'death': 8, 'hover': 6, 'fire': 6}
    for tr in list(ad.nla_tracks):
        act = tr.strips[0].action
        ad.action = act
        if hasattr(ad, 'action_slot') and act.slots: ad.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        n = nframes.get(act.name, 6)
        loop = act.name not in ('death',)
        for i in range(n):
            f = f0 + (f1 - f0) * i / (n if loop else n - 1)
            sc.frame_set(int(round(f)))
            sc.render.filepath = os.path.join(PREVIEW_OUT, f'{stem}__{act.name}__{i:02d}.png')
            bpy.ops.render.render(write_still=True)


names = ONLY or list(HUMANOIDS) + list(MECHS)
for stem in names:
    rig, mesh, used = build(stem)
    acts = [t.name for t in rig.animation_data.nla_tracks]
    print(f'RIG {stem} groups={sorted(used)} actions={acts}')
    if MODE == 'export': export(stem, rig, mesh)
    else: preview(stem, rig)
