# Smooth "HD" humanoid kit for Strike Zone agents (v32).
# Rounded capsules / soft-box blobs instead of bevelled cubes, every outfit detail (vest, pouches,
# straps, pockets, knee pads, belts, face) painted into ONE small texture instead of glued-on boxes.
# Pipeline: build parts (one loose mesh per bone region, so rig.py's rigid skinning still works)
#   -> join -> UV unwrap (face gets extra texels) -> bake AO to vertices -> rasterize every texel's
#   3D position / normal / part id -> paint in numpy -> 512px JPEG -> glTF with 2 materials (body + glow).
import bpy, bmesh, math
import numpy as np
from mathutils import Vector

# part ids (stored per face while building)
SKIN, NECK, TORSO, HIPS, UARM, FARM, GLOVE, THIGH, SHIN, BOOT = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
HAIR, HELMET, ACC, DARK, METAL, LENS, PACK, SHOULDER = 11, 12, 13, 14, 15, 16, 17, 18
GLOW = 99
HEAD_C = (0, -0.004, 1.71)
HEAD_R = (0.134, 0.143, 0.156)


def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.worlds, bpy.data.images):
        for d in list(coll): coll.remove(d)


def _sgnpow(v, e): return math.copysign(abs(v) ** e, v)


class Kit:
    """Builds smooth parts. Coordinates: Z up, face toward -Y, T-pose, unit-height (scaled by h at the end)."""
    def __init__(s): s.parts = []

    def _obj(s, verts, faces, pid):
        me = bpy.data.meshes.new('p'); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        a = me.attributes.new('pid', 'INT', 'FACE'); a.data.foreach_set('value', [pid] * len(me.polygons))
        ob = bpy.data.objects.new('p', me); bpy.context.scene.collection.objects.link(ob)
        s.parts.append(ob); return ob

    @staticmethod
    def _grid_faces(rings, seg, top_pole, bot_pole):
        """rings x seg vertex grid (+ optional pole vertices appended at the end: bottom then top)."""
        f = []
        for r in range(rings - 1):
            for i in range(seg):
                a, b = r * seg + i, r * seg + (i + 1) % seg
                f.append((a, b, b + seg, a + seg))
        n = rings * seg
        if bot_pole:
            for i in range(seg): f.append((n, (i + 1) % seg, i))
        if top_pole:
            t = n + (1 if bot_pole else 0); o = (rings - 1) * seg
            for i in range(seg): f.append((o + i, o + (i + 1) % seg, t))
        return f

    def blob(s, c, half, pid, e=0.6, seg=16, rings=10, deform=None):
        """Soft box / ellipsoid (super-ellipsoid, e=1 sphere, e->0 box). deform(x,y,z) on unit coords."""
        V = []
        for r in range(1, rings):
            v = -math.pi / 2 + math.pi * r / rings
            cv, sv = math.cos(v), math.sin(v)
            for i in range(seg):
                u = 2 * math.pi * i / seg
                x, y, z = _sgnpow(cv, e) * _sgnpow(math.cos(u), e), _sgnpow(cv, e) * _sgnpow(math.sin(u), e), _sgnpow(sv, e)
                V.append((x, y, z))
        V += [(0, 0, -1), (0, 0, 1)]
        out = []
        for x, y, z in V:
            if deform: x, y, z = deform(x, y, z)
            out.append(Vector((c[0] + x * half[0], c[1] + y * half[1], c[2] + z * half[2])))
        return s._obj(out, s._grid_faces(rings - 1, seg, True, True), pid)

    def caps(s, p1, p2, r1, r2, pid, seg=14, hemi=3, mid=3, sx=1.0, sy=1.0, bulge=0.0, ref=(1, 0, 0)):
        """Tapered capsule between joint centres p1 -> p2 (rounded ends overlap neighbours like an action figure)."""
        a, b = Vector(p1), Vector(p2); ax = (b - a); L = ax.length; ax.normalize()
        u = Vector(ref); u = (u - ax * u.dot(ax)).normalized(); w = ax.cross(u)
        prof = []   # (axial offset, radius)
        for k in range(hemi, 0, -1):
            ph = math.pi / 2 * k / (hemi + 0.0)
            prof.append((-r1 * math.sin(ph), r1 * math.cos(ph)))
        for k in range(mid + 2):
            t = k / (mid + 1)
            prof.append((L * t, (r1 + (r2 - r1) * t) * (1 + bulge * math.sin(math.pi * t))))
        for k in range(1, hemi + 1):
            ph = math.pi / 2 * k / (hemi + 0.0)
            prof.append((L + r2 * math.sin(ph), r2 * math.cos(ph)))
        prof = [p for p in prof if p[1] > 1e-5]
        V = []
        for d, r in prof:
            for i in range(seg):
                t = 2 * math.pi * i / seg
                V.append(a + ax * d + u * (math.cos(t) * r * sx) + w * (math.sin(t) * r * sy))
        V += [a - ax * r1, b + ax * r2]
        return s._obj(V, s._grid_faces(len(prof), seg, True, True), pid)

    def join(s, name):
        bpy.ops.object.select_all(action='DESELECT')
        for o in s.parts: o.select_set(True)
        bpy.context.view_layer.objects.active = s.parts[0]
        bpy.ops.object.join(); ob = bpy.context.object; ob.name = name
        return ob


# ---------------------------------------------------------------- shared humanoid body
def humanoid(K, B=1.0, head=True, ears=True, nose=True, torso_bulk=1.0, chest=1.0):
    """Base body. Returns (sx, lx). Joint positions match rig.py's skeleton exactly."""
    sx, lx = 0.25 * B, 0.11 * B
    t = (0.5 + 0.5 * B) * 1.16              # limb thickness scale (chunky toy proportions)
    tb = torso_bulk
    # torso (chest region) - tapered soft box, broader at the top, slight chest curve
    def torso_def(x, y, z):
        k = (z + 1) / 2
        x *= 0.80 + 0.20 * k
        if y < 0: y *= 1.0 + 0.10 * chest * math.sin(math.pi * min(1, k * 1.2))
        return x, y, z
    K.blob((0, 0.0, 1.285), (0.222 * B * tb, 0.136 * tb, 0.228), TORSO, e=0.55, seg=20, rings=12, deform=torso_def)
    # hips
    K.blob((0, 0.0, 1.0), (0.185 * B, 0.118, 0.092), HIPS, e=0.6, seg=16, rings=8)
    # shoulders (ride the chest bone)
    for k in (-1, 1):
        K.blob((k * sx, 0, 1.432), (0.082 * t, 0.088 * t, 0.082 * t), SHOULDER, e=0.9, seg=12, rings=8)
    # arms
    for k in (-1, 1):
        K.caps((k * (sx + 0.02), 0, 1.428), (k * (sx + 0.30), 0, 1.42), 0.072 * t, 0.062 * t, UARM, sx=1.0, sy=1.05, bulge=0.07, ref=(0, 0, 1))
        K.caps((k * (sx + 0.30), 0, 1.42), (k * (sx + 0.535), 0, 1.42), 0.062 * t, 0.052 * t, FARM, bulge=0.10, ref=(0, 0, 1))
        K.blob((k * (sx + 0.615), -0.004, 1.42), (0.066, 0.062 * t, 0.066 * t), GLOVE, e=0.7, seg=12, rings=8)
        K.blob((k * (sx + 0.595), -0.062 * t, 1.425), (0.028, 0.03, 0.024), GLOVE, e=0.8, seg=8, rings=6)   # thumb
    # legs
    for k in (-1, 1):
        K.caps((k * lx, 0, 0.93), (k * lx, 0, 0.54), 0.097 * t, 0.080 * t, THIGH, bulge=0.05)
        K.caps((k * lx, 0, 0.535), (k * lx, 0.005, 0.175), 0.086 * t, 0.068 * t, SHIN, bulge=0.07)
        def boot_def(x, y, z):
            if y < 0: z = z - 0.25 * (1 - z) * (-y) * 0.5 - 0.0     # toe slopes down
            return x, y, z
        K.blob((k * lx, -0.038, 0.095), (0.088 * t, 0.16, 0.098), BOOT, e=0.55, seg=14, rings=8, deform=boot_def)
    # neck + head
    K.caps((0, 0.005, 1.505), (0, 0.005, 1.595), 0.058, 0.055, NECK, seg=10, hemi=2, mid=1)
    if head:
        def head_def(x, y, z):
            if z < 0: x *= 1 - 0.16 * (-z); y *= 1 - 0.06 * (-z)     # narrower jaw
            return x, y, z
        K.blob(HEAD_C, HEAD_R, SKIN, e=0.85, seg=20, rings=14, deform=head_def)
        if ears:
            for k in (-1, 1): K.blob((k * (HEAD_R[0] - 0.003), 0.012, 1.70), (0.02, 0.034, 0.045), SKIN, e=0.9, seg=8, rings=6)
        if nose:
            K.blob((0, -HEAD_R[1] + 0.006, 1.69), (0.02, 0.02, 0.028), SKIN, e=0.9, seg=8, rings=6, deform=lambda x, y, z: (x, y, z) if y > 0 else (x * (1 - 0.3 * (1 - z) / 2), y, z))
    return sx, lx


# ---------------------------------------------------------------- noise (cheap, deterministic)
class Noise:
    def __init__(s, seed, n=10, freq=9.0):
        r = np.random.default_rng(seed)
        s.k = r.normal(size=(n, 3)) * freq; s.ph = r.uniform(0, 6.283, n)
    def __call__(s, P, f=1.0):
        return np.sin(P @ (s.k.T * f) + s.ph).mean(1) * 1.6     # roughly -1..1


def srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


# ---------------------------------------------------------------- texture pipeline
def _uv(ob, head_scale=1.7):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    if not ob.data.uv_layers: ob.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    me = ob.data
    pid = np.zeros(len(me.polygons), int); me.attributes['pid'].data.foreach_get('value', pid)
    uv = np.zeros(len(me.loops) * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    starts = np.zeros(len(me.polygons), int); me.polygons.foreach_get('loop_start', starts)
    tot = np.zeros(len(me.polygons), int); me.polygons.foreach_get('loop_total', tot)
    loop_pid = np.repeat(pid, tot)
    big = np.isin(loop_pid, (SKIN,)) ; mid = np.isin(loop_pid, (TORSO, HAIR, HELMET))
    for m, k in ((big, head_scale), (mid, 1.8)):
        if m.any():
            c = uv[m].mean(0); uv[m] = c + (uv[m] - c) * k
    me.uv_layers.active.data.foreach_set('uv', uv.ravel())
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')


def _bake_ao(ob, dist=0.35, samples=32):
    me = ob.data
    if 'AO' not in me.color_attributes: me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = me.color_attributes['AO']
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.light_settings.distance = dist
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    ao = np.ones(len(me.loops))
    try:
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        a = np.zeros(len(me.loops) * 4); me.color_attributes['AO'].data.foreach_get('color', a); ao = a[0::4]
    except Exception as e:
        print('AO bake failed, using white:', e)
    me.color_attributes.remove(me.color_attributes['AO'])
    return ao


def _raster(ob, res, loop_ao):
    me = ob.data; me.calc_loop_triangles()
    nt = len(me.loop_triangles)
    tl = np.zeros(nt * 3, int); me.loop_triangles.foreach_get('loops', tl); tl = tl.reshape(-1, 3)
    tp = np.zeros(nt, int); me.loop_triangles.foreach_get('polygon_index', tp)
    uv = np.zeros(len(me.loops) * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2) * res - 0.5
    lv = np.zeros(len(me.loops), int); me.loops.foreach_get('vertex_index', lv)
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    vn = np.zeros(len(me.vertices) * 3); me.vertex_normals.foreach_get('vector', vn); vn = vn.reshape(-1, 3)
    pid = np.zeros(len(me.polygons), int); me.attributes['pid'].data.foreach_get('value', pid)
    P = np.zeros((res, res, 3)); N = np.zeros((res, res, 3)); ID = np.zeros((res, res), int)
    AO = np.ones((res, res)); F = np.zeros((res, res), bool)
    for t in range(nt):
        L = tl[t]; q = uv[L]
        x0, y0 = np.floor(q.min(0)).astype(int); x1, y1 = np.ceil(q.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, res - 1), min(y1, res - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax_, ay), (bx, by), (cx, cy) = q
        den = (by - cy) * (ax_ - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12: continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        w1 = ((cy - ay) * (xs - cx) + (ax_ - cx) * (ys - cy)) / den
        w2 = 1 - w0 - w1
        m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not m.any(): continue
        W = np.stack([w0[m], w1[m], w2[m]], 1)
        V = lv[L]; yy, xx = ys[m], xs[m]
        P[yy, xx] = W @ co[V]; N[yy, xx] = W @ vn[V]; AO[yy, xx] = W @ loop_ao[L]
        ID[yy, xx] = pid[tp[t]]; F[yy, xx] = True
    n = np.linalg.norm(N, axis=2, keepdims=True); N = N / np.maximum(n, 1e-6)
    return P, N, ID, AO, F


def _dilate(img, F, it=10):
    img = img.copy(); F = F.copy()
    for _ in range(it):
        acc = np.zeros_like(img); cnt = np.zeros(F.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            acc += np.roll(np.roll(img * F[..., None], dy, 0), dx, 1); cnt += np.roll(np.roll(F, dy, 0), dx, 1)
        new = (~F) & (cnt > 0)
        img[new] = acc[new] / cnt[new][:, None]; F = F | new
    img[~F] = img[F].mean(0)
    return img


def finish(ob, name, painter, h=1.0, res=768, glow=(1.0, 0.15, 0.08), glow_strength=3.0, ao_dist=0.35):
    """UV + AO + paint + materials, then scale to height h. painter(P,N,ID,AO) -> linear RGB (n,3)."""
    me = ob.data
    pid = np.zeros(len(me.polygons), int); me.attributes['pid'].data.foreach_get('value', pid)
    body = bpy.data.materials.new(name + '_body'); body.use_nodes = True
    gm = bpy.data.materials.new(name + '_glow'); gm.use_nodes = True
    g = gm.node_tree.nodes['Principled BSDF']
    g.inputs['Base Color'].default_value = (*glow, 1); g.inputs['Emission Color'].default_value = (*glow, 1)
    g.inputs['Emission Strength'].default_value = glow_strength
    me.materials.clear(); me.materials.append(body); me.materials.append(gm)
    me.polygons.foreach_set('material_index', (pid == GLOW).astype(int))
    _uv(ob)
    ao = _bake_ao(ob, dist=ao_dist)
    R2 = res * 2                                  # paint at 2x and box-filter down = anti-aliased outfit edges
    P, N, ID, AO, F = _raster(ob, R2, ao)
    col = np.zeros((R2, R2, 3))
    m = F & (ID != GLOW)
    col[m] = painter(P[m], N[m], ID[m], AO[m])
    col = _dilate(srgb(col), m, it=16)
    col = col.reshape(res, 2, res, 2, 3).mean((1, 3))
    img = bpy.data.images.new(name + '_tex', res, res, alpha=False)
    px = np.ones((res, res, 4)); px[..., :3] = col
    img.pixels.foreach_set(px.ravel().astype(np.float32)); img.file_format = 'JPEG'; img.pack()
    nt = body.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = 0.8
    tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
    nt.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
    me.attributes.remove(me.attributes['pid'])
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    ob.scale = (h, h, h)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(scale=True)
    return tris


def export(ob, path):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_image_format='JPEG', export_jpeg_quality=86)


# ---------------------------------------------------------------- painting helpers
def mix(a, b, t):
    t = np.clip(t, 0, 1)[:, None] if np.ndim(t) else t
    return a * (1 - t) + np.asarray(b) * t


def band(d, w, soft=0.004):
    """1 inside |d|<w, soft edge."""
    return np.clip((w - np.abs(d)) / soft + 0.5, 0, 1)


def rect(u, v, u0, u1, v0, v1, soft=0.004):
    return band(u - (u0 + u1) / 2, (u1 - u0) / 2, soft) * band(v - (v0 + v1) / 2, (v1 - v0) / 2, soft)


def ellipse(u, v, cu, cv, ru, rv, soft=0.08):
    d = np.sqrt(((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2)
    return np.clip((1 - d) / soft + 0.5, 0, 1)


def render(path_prefix, scale=2.6, zc=1.05, res=(560, 540), views=('front', 'three', 'side')):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.14, 0.16, 0.20, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.8; sc.world = w
    bpy.ops.object.light_add(type='SUN', location=(2, -3, 4)); s = bpy.context.object
    s.rotation_euler = (math.radians(45), math.radians(10), math.radians(35)); s.data.energy = 3.5
    bpy.ops.object.light_add(type='AREA', location=(-2, 2.5, 2.5)); a = bpy.context.object
    a.data.energy = 120; a.data.size = 2; a.rotation_euler = (math.radians(-50), math.radians(-30), 0)
    bpy.ops.mesh.primitive_plane_add(size=6); f = bpy.context.object
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.20, 0.22, 0.26, 1); f.data.materials.append(fm)
    bpy.ops.object.camera_add(); cam = bpy.context.object; sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = scale
    V = {'front': ((0, -6, zc), (90, 0, 0)), 'three': ((4.2, -4.2, zc + 0.6), (82, 0, 45)), 'side': ((6, 0, zc), (90, 0, 90)),
         'face': ((0, -6, 1.70 * 1.0), (90, 0, 0))}
    for nm in views:
        loc, rot = V[nm]
        cam.location = loc; cam.rotation_euler = [math.radians(v) for v in rot]
        sc.render.filepath = f'{path_prefix}_{nm}.png'; bpy.ops.render.render(write_still=True)
