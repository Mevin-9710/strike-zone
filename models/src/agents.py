# Strike Zone agents v32: smooth "HD" bodies with painted-in outfits (replaces the boxy builders that
# lived in operatives.py / enemies.py). 5 Civic Shield operatives + 4 Meridian Covenant humanoids.
# Run: blender -b -P agents.py -- <renders_dir> [keys...]      (writes ../<key>.glb next to renders_dir)
# Then rig:  blender -b -P rig.py -- export <models_dir> [stems...]
import bpy, sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from body import *   # noqa

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, ONLY = argv[0], argv[1:]

RED = dict(base=(0.42, 0.05, 0.05), dark=(0.16, 0.02, 0.02), light=(0.70, 0.12, 0.10), deep=(0.08, 0.01, 0.01), glow=(1.0, 0.15, 0.08))
WHITE, IRIS = np.array((0.86, 0.86, 0.84)), np.array((0.09, 0.055, 0.035))


# ================================================================ painter
def painter(S):
    B = S.get('B', 1.0); sx, lx = 0.25 * B, 0.11 * B
    nz, nf = Noise(S.get('seed', 1), freq=7.0), Noise(S.get('seed', 1) + 11, n=14, freq=45.0)
    def C(k):
        v = S.get(k)
        return np.array(v if v is not None else S['top'], float)

    def paint(P, N, ID, AO):
        x, y, z = P[:, 0], P[:, 1], P[:, 2]; ax = np.abs(x); sg = np.sign(x)
        col = np.zeros((len(x), 3))
        table = {SKIN: 'skin', NECK: S.get('neck_col', 'skin'), TORSO: 'top', HIPS: 'pants', UARM: 'sleeve', FARM: 'sleeve',
                 GLOVE: 'gloves', THIGH: 'pants', SHIN: 'pants', BOOT: 'boots', HAIR: 'hair', HELMET: 'helmet', ACC: 'accent',
                 DARK: 'dark', METAL: 'metal', LENS: 'lens', PACK: 'pack', SHOULDER: 'shoulder'}
        for p, k in table.items(): col[ID == p] = C(k)
        T, H, UA, FA, G, TH, SH, BT, SK = (ID == TORSO, ID == HIPS, ID == UARM, ID == FARM, ID == GLOVE, ID == THIGH, ID == SHIN, ID == BOOT, ID == SKIN)
        front, back = y < -0.03, y > 0.03

        def put(mask, c, k=1.0):
            m = mask if np.ndim(mask) and mask.dtype == bool else None
            t = (mask.astype(float) if m is not None else mask) * k
            col[:] = col * (1 - t[:, None]) + np.asarray(c, float) * t[:, None]

        # ---------- coat (painted, long tails on the thighs) ----------
        if S.get('coat'):
            put(TH & (z > 0.60), C('coatcol'))
            put(TH & (z > 0.60) & (z < 0.625), C('coatcol') * 0.6)       # hem
            put(TH & (z > 0.60) & front & (np.abs(x) < lx - 0.02), C('coatcol') * 0.7)   # inner fold
            put(H, C('coatcol'))
            put((T | H) & front & (ax < 0.012), C('coatcol') * 0.45)       # opening
        # ---------- torso: vest / plate carrier ----------
        if S.get('vest'):
            V = C('vest')
            arm = (ax > 0.14 * B) & (z > 1.33)
            vm = T & (z > 1.07) & (z < 1.47) & ~arm
            strap = T & (z >= 1.38) & (ax > 0.055 * B) & (ax < 0.125 * B)
            put(vm | strap, V)
            put(T & (z > 1.07) & (z < 1.088) & ~arm, V * 0.55)                          # bottom trim
            put(T & (z > 1.455) & (z < 1.47) & (ax < 0.055 * B), V * 0.55)              # neckline trim
            put(T & arm & (z < 1.36) & (ax < 0.15 * B), V * 0.55)                       # armhole trim
            if S.get('pouches', True):
                for cx in (-0.105 * B, 0.0, 0.105 * B):
                    pm = T & front & (rect(x, z, cx - 0.042 * B, cx + 0.042 * B, 1.10, 1.24) > 0.5)
                    put(pm, V * 0.78)
                    put(pm & (z > 1.205), V * 0.95)                                     # flap
                    put(T & front & (rect(x, z, cx - 0.042 * B, cx + 0.042 * B, 1.198, 1.206) > 0.5), V * 0.45)
                    put(T & front & (rect(x, z, cx - 0.01, cx + 0.01, 1.215, 1.232) > 0.5), C('dark'))    # snap
            put(T & back & (ax < 0.14 * B) & (z > 1.12) & (z < 1.40) & (np.mod(z, 0.034) < 0.008), V * 0.6)   # webbing
            put(T & front & (rect(x, z, 0.035 * B, 0.14 * B, 1.33, 1.375) > 0.5), C('accent'))              # name tape
        else:
            put(T & front & (ax < 0.006), C('top') * 0.45)                              # zipper
            for k in (-1, 1):                                                           # chest pockets
                pm = T & front & (rect(x, z, k * 0.09 * B - 0.045, k * 0.09 * B + 0.045, 1.28, 1.37) > 0.5)
                put(pm, C('top') * 0.82); put(T & front & (rect(x, z, k * 0.09 * B - 0.045, k * 0.09 * B + 0.045, 1.36, 1.37) > 0.5), C('top') * 0.5)
        if S.get('stripes'):
            for k in (-1, 1): put(T & front & (np.abs(x - k * 0.125 * B) < 0.014) & (z > 1.10) & (z < 1.46), C('accent'))
        if S.get('cape'):
            put(T & (z > 1.40), C('cape')); put(T & (z > 1.40) & (z < 1.415), C('cape') * 0.55)
            put(ID == SHOULDER, C('cape'))
        if S.get('mantle'):
            put(T & (z > 1.43), C('mantle')); put(ID == SHOULDER, C('mantle'))
        if S.get('straps'):
            for k in (-1, 1): put(T & (np.abs(ax - 0.10 * B) < 0.02) & (z > 1.12) & ~(back & (z < 1.42)), C('dark'))
        if S.get('scarf'):
            put((T & (z > 1.44)) | (ID == NECK), C('accent')); put(T & (z > 1.44) & (z < 1.455), C('accent') * 0.6)
        for k in S.get('lights', []):
            put(T & front & (ellipse(x, z, k * 0.12, 1.40, 0.018, 0.018, 0.4) > 0.5), C('lightcol'))
        put(T & (z > 1.49), C(S.get('collar', 'top')) * 0.8)                                          # collar fold
        # ---------- hips / belt ----------
        put(H & (z > 1.03) & (z < 1.078), C('belt'))
        put(H & front & (ax < 0.03) & (z > 1.035) & (z < 1.073), C('metal'))
        for k in (-1, 1): put(H & front & (rect(x, z, k * 0.12 * B - 0.035, k * 0.12 * B + 0.035, 0.96, 1.035) > 0.5), C('belt') * 1.2)
        # ---------- arms ----------
        put(UA & (ax > sx + 0.07) & (ax < sx + 0.16) & (z > 1.432) & (np.abs(y) < 0.05), C('accent'))       # shoulder patch
        put(UA & (ax > sx + 0.09) & (ax < sx + 0.14) & (z > 1.432) & (np.abs(y) < 0.022), C('patch2'))
        if S.get('chevron'):
            put(UA & front & (np.abs((ax - sx - 0.12) - np.abs(z - 1.42) * 0.8) < 0.012) & (np.abs(z - 1.42) < 0.04), C('accent'))
        put(FA & (ax > sx + 0.495), C('cuff'))                                                              # glove cuff
        put(UA & (ax > sx + 0.27), C('sleeve') * 0.82)                                                      # elbow fold
        if S.get('elbowpads'): put(FA & (ax < sx + 0.36) & (y > 0.0), C('pad'))
        # ---------- gloves ----------
        put(G & (ax > sx + 0.645) & (z > 1.43), C('gloves') * 0.6)                                          # knuckle pad
        put(G & (ax > sx + 0.655) & (np.mod(y + 0.06, 0.028) < 0.005), C('gloves') * 0.5)                   # fingers
        # ---------- legs ----------
        lxx = x - sg * lx
        out = TH & (np.abs(x) > lx + 0.05)
        pk = out & (np.abs(y) < 0.05) & (z > 0.60) & (z < 0.77)
        if not S.get('coat'):
            put(pk, C('pants') * 0.8); put(pk & (z > 0.745), C('pants') * 0.55)
            put(TH & front & (np.abs(lxx) < 0.004) & (z < 0.88), C('pants') * 0.7)                          # crease
        if S.get('kneepads'):
            kp = (TH | SH) & (y < -0.01)
            e = ellipse(lxx, z, 0.0, 0.535, 0.064, 0.078, 0.2)
            put(kp & (e > 0.5), C('pad')); put(kp & (e > 0.5) & (z > 0.56), C('pad') * 1.25)
            put(kp & (np.abs(e - 0.5) < 0.12), C('pad') * 0.5)
        put(SH & (z < 0.24) & (np.sin(z * 160) > 0), C('pants') * 0.75, 0.5)                             # tucked folds
        # ---------- boots ----------
        put(BT & (z < 0.032), C('boots') * 0.45)                                                            # sole
        put(BT & (z < 0.02), C('boots') * 0.3)
        put(BT & (y < -0.11) & (z > 0.032), C('boots') * 1.25)                                              # toe cap
        lace = BT & (y < -0.045) & (np.abs(lxx) < 0.032) & (z > 0.075)
        put(lace & (np.mod(z, 0.024) < 0.008), C('boots') * 2.2 + 0.05)
        put(BT & (z > 0.145), C('boots') * 0.7)                                                             # cuff
        # ---------- face ----------
        hx, hz = HEAD_R[0], HEAD_R[2]
        u, v = x / hx, (z - HEAD_C[2]) / hz
        F = SK & (y < -0.07) & (np.abs(u) < 1.2)
        mode = S.get('face', 'eyes')
        if S.get('balaclava'):
            band_ = (v > -0.10) & (v < 0.24) & (np.abs(u) < 0.78) & (y < -0.04)
            put(SK & ~band_, C('mask'))
            put(SK & band_, C('maskband'))
            put(SK & (np.abs(v + 0.10) < 0.03) & (np.abs(u) < 0.78) & (y < -0.04), C('mask') * 0.6)
        if mode == 'eyes':
            for k in (-1, 1):
                ew = ellipse(u, v, k * 0.37, 0.06, 0.19, 0.12, 0.15)
                put(F & (ew > 0.5), WHITE)
                put(F & (ellipse(u, v, k * 0.33, 0.055, 0.105, 0.115, 0.2) > 0.5), C('iris'))
                put(F & (ellipse(u, v, k * 0.33, 0.055, 0.05, 0.055, 0.3) > 0.5), (0.01, 0.01, 0.01))
                put(F & (ellipse(u, v, k * 0.33 + 0.035, 0.10, 0.028, 0.03, 0.3) > 0.5), (1, 1, 1))
                lid = ellipse(u, v + 0.02, k * 0.37, 0.07, 0.22, 0.14, 0.15)
                put(F & (lid > 0.5) & (ew < 0.5) & (v > 0.07), C('lash'))
                bw = F & (np.abs(u - k * 0.38) < 0.19) & (np.abs(v - 0.27 - 0.10 * (np.abs(u) - 0.38)) < 0.038)
                put(bw, C('brow'))
            put(F & (ellipse(u, v, 0, -0.47, 0.18, 0.03, 0.3) > 0.5), C('skin') * np.array((0.55, 0.38, 0.36)))   # mouth
            put(F & (ellipse(u, v, 0, -0.55, 0.13, 0.04, 0.5) > 0.5), C('skin') * 0.85)                          # lower lip shade
            for k in (-1, 1): put(F, C('skin') * np.array((1.15, 0.85, 0.82)), 0.25 * np.clip(1 - np.hypot((u - k * 0.48) / 0.22, (v + 0.2) / 0.16), 0, 1))
        if S.get('beard'):
            bm = SK & (y < 0.07) & (v < -0.12 - 0.05 * (1 - np.abs(u))) & ~(ellipse(u, v, 0, -0.47, 0.17, 0.03, 0.3) > 0.5)
            put(bm, C('hair') * 1.3); put(bm & (np.sin(u * 60) > 0.3), C('hair'))
            put(SK & (y < -0.07) & (ellipse(u, v, 0, -0.36, 0.26, 0.065, 0.3) > 0.5), C('hair'))                  # moustache
        if S.get('stubble'):
            sm = SK & (y < 0.06) & (v < -0.18)
            put(sm, C('skin') * 0.72, 0.55)
        # ---------- hair / helmet / gear ----------
        HR = ID == HAIR
        ang = np.arctan2(y, x)
        put(HR, C('hair') * 1.6, (0.25 + 0.25 * np.sin(ang * 26 + nz(P) * 3)) * (N[:, 2] > 0.2))      # strands
        put(HR & (N[:, 2] > 0.55) & (N[:, 2] < 0.8), C('hair') * 2.2 + 0.03, 0.5)                    # sheen
        if S.get('headband'):
            put(HR & (np.abs(z - S['headband']) < 0.016), C('accent'))
        HM = ID == HELMET
        if HM.any():
            hzmin = np.min(z[HM])
            put(HM & (z < hzmin + 0.022), C('helmet') * 0.6)                                         # rim
            put(HM & (ax > 0.125) & (np.abs(z - (hzmin + 0.06)) < 0.012), C('dark'))                  # side rail
            put(HM & (y < -0.06) & (np.abs(x) < 0.035) & (z > hzmin + 0.07) & (z < hzmin + 0.11), C('dark'))   # mount
            put(HM & back & (np.abs(x) < 0.05) & (np.abs(z - (hzmin + 0.09)) < 0.03), C('accent'))   # back patch
        LS = ID == LENS
        if LS.any():
            put(LS, C('lens') * 1.8 + 0.08, np.clip((z - np.min(z[LS])) / 0.06, 0, 1) * 0.6)
            put(LS & (np.abs(x - 0.03 - (z - 1.70)) < 0.008), (0.9, 0.95, 1.0), 0.8)
        PK = ID == PACK
        if PK.any():
            put(PK & (y > 0.27) & (rect(x, z, -0.09, 0.09, 1.14, 1.30) > 0.5), C('pack') * 0.75)
            put(PK & (y > 0.27) & (rect(x, z, -0.09, 0.09, 1.28, 1.30) > 0.5), C('pack') * 0.5)
            put(PK & (y > 0.27) & (rect(x, z, -0.03, 0.03, 1.33, 1.37) > 0.5), C('accent'))
        # ---------- painted light + fabric ----------
        skin = SK | (ID == NECK)
        fab = 1 + 0.05 * nz(P) + np.where(skin, 0.0, 0.035) * nf(P)
        grad = 0.86 + 0.16 * np.clip(z / 1.9, 0, 1)
        lit = 1 + 0.06 * np.clip(N[:, 2], 0, 1)
        ao = 0.40 + 0.60 * AO
        return col * (fab * grad * lit * ao)[:, None]
    return paint


# ================================================================ head gear builders
def hair_cap(K, scale=1.07, front=0.42, nape=-0.35, top=0.0, pid=HAIR, c=(0, 0.004, HEAD_C[2] + 0.007)):
    def d(x, y, z):
        if (y < -0.25 and z < front) or z < nape or (y < 0.25 and z < -0.05):
            return x * 0.84, y * 0.84, z * 0.96            # pulled inside the head = hairline
        return x, y, z + (top if z > 0.5 else 0)
    return K.blob(c, (HEAD_R[0] * scale, HEAD_R[1] * scale, HEAD_R[2] * scale), pid, e=0.85, seg=20, rings=14, deform=d)


def combat_helmet(K, pid=HELMET, c=(0, 0.006, 1.77), half=(0.160, 0.170, 0.136), cups=True):
    def d(x, y, z):
        if z < 0:
            drop = 0.30 + 0.55 * max(0.0, min(1.0, (y + 0.2) / 1.0))      # low at the back, high over the eyes
            z = z * drop
        return x, y, z
    K.blob(c, half, pid, e=0.8, seg=22, rings=12, deform=d)
    if cups:
        for k in (-1, 1): K.blob((k * 0.146, 0.01, 1.70), (0.03, 0.058, 0.062), DARK, e=0.8, seg=12, rings=8)


def visor(K, pid, c=(0, -0.127, 1.722), half=(0.126, 0.03, 0.034), wrap=0.9):
    return K.blob(c, half, pid, e=0.6, seg=14, rings=6, deform=lambda x, y, z: (x, y + wrap * x * x * 1.0, z))


def hood(K, pid=TORSO, c=(0, 0.022, 1.727), half=(0.162, 0.172, 0.186)):
    def d(x, y, z):
        if y < -0.5 and abs(z) < 0.72 and abs(x) < 0.8: y = -0.5
        return x, y, z
    return K.blob(c, half, pid, e=0.8, seg=22, rings=14, deform=d)


# ================================================================ characters
OPS = {
    'rhea': dict(name='Rhea Voss', h=1.00, B=1.00, skin=(0.62, 0.42, 0.30), hair=(0.03, 0.025, 0.02), top=(0.07, 0.09, 0.13),
                 pants=(0.12, 0.13, 0.16), accent=(0.10, 0.45, 1.0), gear='short', kneepads=True, stripes=True, headband=1.79),
    'kade': dict(name='Kade Mercer', h=1.06, B=1.25, skin=(0.45, 0.30, 0.22), hair=(0.05, 0.04, 0.03), top=(0.22, 0.25, 0.14),
                 pants=(0.16, 0.15, 0.11), accent=(1.0, 0.55, 0.10), gear='helmet', helmetcol=(0.24, 0.27, 0.16), vest=True, vestcol=(0.30, 0.32, 0.36),
                 shoulder_metal=True, stubble=True, kneepads=True, torso_bulk=1.05),
    'yuna': dict(name='Yuna Sato', h=0.96, B=0.90, skin=(0.80, 0.62, 0.48), hair=(0.02, 0.02, 0.03), top=(0.72, 0.74, 0.78),
                 pants=(0.20, 0.22, 0.26), accent=(0.05, 0.75, 0.70), gear='hood', coat=True, scarf=True),
    'tomas': dict(name='Tomas Reyes', h=1.02, B=1.10, skin=(0.55, 0.38, 0.26), hair=(0.12, 0.08, 0.05), top=(0.36, 0.24, 0.14),
                  pants=(0.13, 0.14, 0.17), accent=(1.0, 0.82, 0.15), gear='cap', beard=True, pack=True, chevron=True),
    'amara': dict(name='Amara Diallo', h=1.08, B=0.95, skin=(0.28, 0.18, 0.12), hair=(0.03, 0.02, 0.02), top=(0.22, 0.12, 0.34),
                  pants=(0.10, 0.10, 0.14), accent=(0.55, 1.0, 0.25), gear='bun', stripes=True, drone=True, elbowpads=True),
}
EN = {   # Meridian Covenant: one red hue only
    'guard': dict(B=1.0, gear='en_helmet', torso_bulk=1.06, vest=True, balaclava=True, top=RED['base'], vestcol=RED['light'], pants=RED['dark'],
                  helmet=RED['base'], kneepads=True, backgun=True),
    'heavy': dict(B=1.35, gear='en_helm', vest=True, vestcol=RED['light'], top=RED['base'], pants=RED['dark'], helmet=RED['base'],
                  kneepads=True, shoulder_plate=True, generator=True, torso_bulk=1.1, pouches=True),
    'sniper': dict(B=1.0, gear='en_hood', top=RED['base'], pants=RED['dark'], coat=True, coatcol=RED['base'], cape=True, mask_lower=True,
                   longgun=True),
    'commander': dict(B=1.05, gear='en_cmd', top=RED['base'], pants=RED['dark'], coat=True, coatcol=RED['base'], mantle=True,
                      lights=(-1, 1), sidearm=True),
}


def build_operative(key, c):
    K = Kit(); B = c['B']
    covered = False
    sx, lx = humanoid(K, B, ears=c['gear'] not in ('hood', 'helmet', 'bun'), torso_bulk=c.get('torso_bulk', 1.0), chest=0.6)
    g = c['gear']
    if g == 'short':
        hair_cap(K, front=0.45, nape=-0.30)
    elif g == 'helmet':
        combat_helmet(K, pid=HELMET)
    elif g == 'hood':
        hood(K); visor(K, LENS, c=(0, -0.131, 1.726), half=(0.118, 0.028, 0.03))
    elif g == 'cap':
        hair_cap(K, front=0.55, nape=-0.30)
        K.blob((0, 0.004, 1.81), (0.143, 0.153, 0.085), ACC, e=0.8, seg=20, rings=10, deform=lambda x, y, z: (x, y, z * 0.35 if z < 0 else z))
        K.blob((0, -0.17, 1.797), (0.11, 0.08, 0.013), ACC, e=0.55, seg=14, rings=6)
    elif g == 'bun':
        hair_cap(K, front=0.45, nape=-0.30)
        K.blob((0, 0.11, 1.86), (0.064, 0.064, 0.064), HAIR, e=1.0, seg=12, rings=8)
        for k in (-1, 1): K.blob((k * 0.136, 0.01, 1.70), (0.028, 0.046, 0.052), DARK, e=0.8, seg=10, rings=8)
        K.caps((0.14, 0.0, 1.74), (0.14, 0.0, 1.91), 0.007, 0.006, ACC, seg=6, hemi=1, mid=0)
        K.caps((0.13, -0.03, 1.67), (0.06, -0.145, 1.635), 0.008, 0.008, DARK, seg=6, hemi=1, mid=0)
    if c.get('pack'):
        K.blob((0, 0.205, 1.26), (0.15 * B, 0.08, 0.17), PACK, e=0.55, seg=16, rings=8)
    if c.get('drone'):
        dx = -sx
        K.blob((dx, 0, 1.54), (0.04, 0.04, 0.025), DARK, e=0.7, seg=8, rings=6)
        K.blob((dx, 0, 1.60), (0.075, 0.075, 0.03), METAL, e=0.6, seg=14, rings=6)
        for ox, oy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            K.blob((dx + ox * 0.085, oy * 0.085, 1.625), (0.045, 0.045, 0.006), ACC, e=1.0, seg=12, rings=4)
        K.blob((dx, -0.07, 1.60), (0.022, 0.012, 0.016), LENS, e=0.9, seg=8, rings=6)
    ob = K.join(c['name'].replace(' ', '_'))
    S = dict(B=B, seed=sum(map(ord, key)), skin=c['skin'], hair=c['hair'], top=c['top'], sleeve=c['top'], pants=c['pants'],
             boots=(0.045, 0.045, 0.05), gloves=(0.05, 0.05, 0.06), accent=c['accent'], metal=(0.30, 0.32, 0.36), dark=(0.035, 0.035, 0.045),
             lens=tuple(0.12 + 0.35 * a for a in c['accent']) if g != 'hood' else (0.30, 0.55, 0.65), pack=c['pants'], belt=(0.04, 0.04, 0.05),
             cuff=c['accent'], patch2=c['top'], pad=(0.05, 0.05, 0.06), iris=IRIS, lash=(0.02, 0.015, 0.012),
             brow=tuple(v * 0.9 for v in c['hair']), helmet=c.get('helmetcol', (0.30, 0.32, 0.36)), shoulder=c['top'], collar='top',
             vest=c.get('vest'), vestcol=c.get('vestcol'), coat=c.get('coat'), coatcol=c['top'], kneepads=c.get('kneepads'),
             stripes=c.get('stripes'), beard=c.get('beard'), stubble=c.get('stubble'), straps=c.get('pack'), chevron=c.get('chevron'),
             scarf=c.get('scarf'), elbowpads=c.get('elbowpads'), headband=c.get('headband'),
             face='none' if covered else 'eyes')
    S['vest'] = S['vestcol'] if c.get('vest') else None
    if c.get('shoulder_metal'): S['shoulder'] = (0.30, 0.32, 0.36)
    S['coat'] = c.get('coat'); S['coatcol'] = c['top']
    return ob, S


def build_enemy(key, c):
    K = Kit(); B = c['B']
    R = RED
    head = c['gear'] != 'en_helm'
    sx, lx = humanoid(K, B, head=head, ears=False, nose=c['gear'] in ('en_cmd',), torso_bulk=c.get('torso_bulk', 1.0), chest=0.8)
    g = c['gear']
    if g == 'en_helmet':
        combat_helmet(K, cups=True)
        visor(K, GLOW, c=(0, -0.131, 1.718), half=(0.108, 0.022, 0.018))
    elif g == 'en_helm':
        K.blob((0, -0.004, 1.715), (0.162, 0.17, 0.185), HELMET, e=0.7, seg=22, rings=14,
               deform=lambda x, y, z: ((x * (1 - 0.12 * -z), y, z) if z < 0 else (x, y, z)))
        visor(K, GLOW, c=(0, -0.168, 1.725), half=(0.118, 0.02, 0.016), wrap=0.7)
        K.blob((0, -0.16, 1.62), (0.075, 0.03, 0.045), DARK, e=0.6, seg=12, rings=6)       # breather
    elif g == 'en_hood':
        hood(K)
        K.blob((0.048, -0.15, 1.722), (0.03, 0.02, 0.03), GLOW, e=1.0, seg=10, rings=6)  # scope eye
    elif g == 'en_cmd':
        hair_cap(K, front=0.55, nape=-0.25, scale=1.06)
        visor(K, GLOW, c=(0, -0.134, 1.722), half=(0.096, 0.018, 0.014))
        K.blob((0, 0.012, 1.515), (0.135, 0.13, 0.065), TORSO, e=0.7, seg=18, rings=6,
               deform=lambda x, y, z: (x, y, z * (1.6 if y > -0.3 else 0.6)))           # high collar (rides the chest)
        for k in (-1, 1): K.blob((k * 0.12, -0.16, 1.40), (0.016, 0.01, 0.016), GLOW, e=1.0, seg=8, rings=6)   # rank lights
    if c.get('backgun'):
        K.caps((-0.16, 0.155, 0.96), (0.19, 0.155, 1.58), 0.028, 0.024, DARK, seg=8, hemi=2, mid=1)
    if c.get('longgun'):
        K.caps((-0.20, 0.15, 0.80), (0.22, 0.15, 1.78), 0.024, 0.02, DARK, seg=8, hemi=2, mid=1)
        K.caps((-0.10, 0.17, 1.03), (0.0, 0.17, 1.26), 0.034, 0.034, DARK, seg=8, hemi=2, mid=0)
    if c.get('generator'):
        K.blob((0, 0.22, 1.30), (0.17, 0.08, 0.20), PACK, e=0.5, seg=16, rings=8)
        K.caps((0.24, 0.30, 0.92), (0.24, 0.30, 1.66), 0.055, 0.05, DARK, seg=12, hemi=2, mid=1)
    if c.get('sidearm'):
        K.caps((-0.205 * B, -0.03, 0.92), (-0.205 * B, -0.03, 1.04), 0.03, 0.03, DARK, seg=8, hemi=2, mid=0)
    ob = K.join(key)
    S = dict(B=B, seed=len(key) * 7, skin=R['light'], hair=R['deep'], top=c['top'], sleeve=c['top'], pants=c['pants'], boots=R['deep'],
             gloves=R['deep'], accent=R['light'], metal=R['light'], dark=R['deep'], lens=R['glow'], pack=R['dark'], belt=R['deep'],
             cuff=R['light'], patch2=R['deep'], pad=R['deep'], iris=R['deep'], lash=R['deep'], brow=R['deep'], helmet=c.get('helmet', R['base']),
             shoulder=c['top'], collar='top', vest=c.get('vestcol') if c.get('vest') else None, vestcol=c.get('vestcol'),
             coat=c.get('coat'), coatcol=c.get('coatcol'), kneepads=c.get('kneepads'), mask=R['deep'], maskband=R['deep'],
             balaclava=c.get('balaclava') or c.get('mask_lower'), face='none', cape=R['light'] if c.get('cape') else None,
             mantle=R['light'] if c.get('mantle') else None, lights=c.get('lights', ()), lightcol=R['glow'], neck_col='top')
    if c.get('shoulder_plate'): S['shoulder'] = R['light']
    if g == 'en_hood': S['balaclava'] = True; S['mask'] = R['deep']; S['maskband'] = R['dark']
    if g == 'en_cmd': S['skin'] = R['light']
    if not c.get('cape'): S.pop('cape')
    if not c.get('mantle'): S.pop('mantle')
    return ob, S


JOBS = {**{k: ('op', v) for k, v in OPS.items()}, **{k: ('en', v) for k, v in EN.items()}}
for key, (kind, c) in JOBS.items():
    if ONLY and key not in ONLY: continue
    clear()
    ob, S = build_operative(key, c) if kind == 'op' else build_enemy(key, c)
    stem = key if kind == 'op' else 'enemy_' + key
    tris = finish(ob, key, painter(S), h=c.get('h', 1.0), glow=RED['glow'])
    export(ob, os.path.join(OUT, '..', stem + '.glb'))
    render(os.path.join(OUT, key), scale=2.9 if key == 'heavy' else 2.6, zc=1.05)
    cam = bpy.context.scene.camera; cam.data.ortho_scale = 0.62; cam.location = (0.25, -6, 1.72 * c.get('h', 1.0)); cam.rotation_euler = (math.radians(90), 0, math.radians(2.4))
    bpy.context.scene.render.filepath = os.path.join(OUT, key + '_face.png'); bpy.ops.render.render(write_still=True)
    print(f'AGENT {key} tris={tris}')
