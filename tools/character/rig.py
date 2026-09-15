"""Rig and animate the static hacker sculpt, headless.

blender -b --python tools/character/rig.py -- SRC.glb OUT.glb RENDER_DIR [TARGET_TRIS]
SHEETS=Walk,Sit (environment, optional) renders only those contact sheets.

The source is an A-pose sculpt with no skeleton and a wide stance: the feet stand about
0.42 m apart while the hip joints are 0.19 m apart, which reads as a "Y" from the front.
This script:

1. decimates the sculpt, scales it to 1.75 m with the feet on the ground;
2. finds the joints from the mesh itself (slices through the legs, torso and arms);
3. corrects the rest pose: each leg turns in about its hip joint until the ankle sits
   under the hip, and the boot turns back so the sole stays flat. The mesh is bent,
   not skinned, for this step, so every clip starts from a natural stance;
4. builds a 19-bone skeleton on the corrected mesh and computes skin weights from
   distance to each bone, with body-region masks and smoothing over the surface, then
   limits them where distance alone misleads (forearm and hand against the trunk, thigh
   above the hip joint, shin below the ankle);
5. authors the clips from targets rather than angles: feet are placed on the ground
   and the legs solved with two-bone IK, the pelvis height comes from how far the legs
   can reach, and the arms are posed with shoulder, elbow and wrist angles (solved
   numerically when a wrist has to reach a point, as for the keyboard);
6. measures every clip in Blender from the evaluated pose and mesh, writes the numbers
   to OUT's .json, exports the GLB and renders front and side contact sheets.

Clips (all in place, 60 fps keys):
  Idle     4.0 s  weight shift and breathing, feet planted under the hips
  Walk     1.07 s heel strike, planted stance foot, toe-off, pelvis turn and drop
  Run      0.7 s  a jog: flight phases, midfoot strike, chest counter-rotation
  Point    2.0 s  keys only Chest, Neck, Head and the right arm, for layering; the open
                  hand is held thumb up, edge on to the spot
  Sit      4.0 s  on a 0.46 m seat centred over the root, feet flat, knees about 90
  SitType  2.0 s  same lower body, gloves palm down over the bench keyboard (key tops
                  0.764 m up, centred 0.46 m forward), forearms above the 0.75 m desk top

Axes: Blender Z up, the character faces -Y, so its left side is +X. The glTF exporter
turns this into Y up, facing +Z. "Forward" below means -Y.
"""
import bpy, math, sys, json, os
import numpy as np
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT, RENDER_DIR = argv[0], argv[1], argv[2]
TARGET = int(argv[3]) if len(argv) > 3 else 32000
META = os.path.splitext(OUT)[0] + ".json"
H = 1.75
FPS = 60
SEAT = 0.46                    # seat top above the feet plane
# the workbench in js/bench.js, measured from the seated character's root (the floor point
# under the seat centre); forward is toward the desk
DESK = dict(top=0.75, thick=0.03, front=0.30)
KEYS = dict(top=0.764, forward=0.46, depth=0.135, width=0.42)
KEY_CLEAR = 0.008              # lowest glove point above the key tops while typing
STANCE_OUT = 0.012             # rest ankle sits this far outside its hip joint

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

src_tris = len(mesh.data.polygons)
dec = mesh.modifiers.new("dec", "DECIMATE")
dec.ratio = min(1.0, TARGET / src_tris)
dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="dec")
mesh.data.validate()
print("decimated", src_tris, "->", len(mesh.data.polygons))

# ---------------------------------------------------------------- normalise
n = len(mesh.data.vertices)
co = np.empty(n * 3, dtype=np.float64)
mesh.data.vertices.foreach_get("co", co)
co = co.reshape(n, 3)
lo, hi = co.min(0), co.max(0)
s = H / (hi[2] - lo[2])
co = np.column_stack(((co[:, 0] - (lo[0] + hi[0]) / 2) * s, (co[:, 1] - (lo[1] + hi[1]) / 2) * s, (co[:, 2] - lo[2]) * s))
X, Y, Z = co[:, 0], co[:, 1], co[:, 2]


def smooth01(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ramp(v, a, b):
    """0 at a, 1 at b, smooth in between (a may be above b for a falling ramp)."""
    return smooth01((v - a) / (b - a))


# ---------------------------------------------------------------- landmarks (sculpt)
def torso_y(z0, z1):
    m = (Z > z0 * H) & (Z < z1 * H) & (np.abs(X) < 0.1 * H)
    return float(Y[m].mean()) if m.any() else 0.0


def band(sgn, z, half=0.012):
    """Centre of one leg's cross-section at height z (2nd to 98th percentile box)."""
    m = (X * sgn > 0.004) & (np.abs(Z - z) < half) & (np.abs(X) < 0.32)
    return np.array([(np.percentile(X[m], 2) + np.percentile(X[m], 98)) / 2,
                     (np.percentile(Y[m], 2) + np.percentile(Y[m], 98)) / 2])


# knee joint: 0.285 of body height barefoot; the hood adds about 4 cm above the head and
# the boot soles 3 cm below the foot, so 0.285 * 1.68 + 0.03
HIP_Z, KNEE_Z, ANKLE_Z = 0.505 * H, 0.51, 0.105
HIP_BACK, KNEE_BACK = 0.035, 0.02
J = {}
J["spine"] = Vector((0, torso_y(0.58, 0.66), 0.62 * H))
J["chest"] = Vector((0, torso_y(0.68, 0.76), 0.72 * H))
# the hood drapes far behind the head, so the neck and head sit a fixed depth behind
# the front of the face and collar instead of at the mean of their slices
face = float(np.percentile(Y[(np.abs(X) < 0.06) & (Z > 1.58) & (Z < 1.68)], 5))
J["neck"] = Vector((0, (J["chest"].y + face + 0.10) / 2, 0.835 * H))
J["head"] = Vector((0, face + 0.10, 0.885 * H))
J["top"] = Vector((0, J["head"].y, 1.0 * H))

arm_angle = {}
for side, sgn in (("L", 1), ("R", -1)):
    # the fingertips are the widest points of an A-pose at mid height
    m = (X * sgn > 0.12 * H) & (Z > 0.3 * H) & (Z < 0.75 * H)
    xs = X[m] * sgn
    cut = np.quantile(xs, 0.995)
    tip = Vector((float(X[m][xs >= cut].mean()), float(Y[m][xs >= cut].mean()), float(Z[m][xs >= cut].mean())))
    shoulder = Vector((sgn * 0.105 * H, J["chest"].y, 0.815 * H))
    arm = tip - shoulder
    J["clav" + side] = Vector((sgn * 0.025 * H, J["chest"].y, 0.80 * H))
    J["shoulder" + side] = shoulder
    J["elbow" + side] = shoulder + arm * 0.42 + Vector((0, 0.012 * H, 0))
    J["wrist" + side] = shoulder + arm * 0.755
    J["tip" + side] = tip
    arm_angle[side] = math.degrees(math.atan2(abs(arm.x), -arm.z))

    # one straight line through the trouser leg's cross-sections gives hip, knee, ankle
    zs = np.arange(0.24, 0.67, 0.02)
    cs = np.array([band(sgn, z) for z in zs])
    fx, fy = np.polyfit(zs, cs[:, 0], 1), np.polyfit(zs, cs[:, 1], 1)
    hx = sgn * float(np.clip(abs(np.polyval(fx, HIP_Z)), 0.07, 0.11))
    ank = band(sgn, 0.18, 0.02)
    # the cargo pockets bulge the front of the trousers, so the slice centres sit ahead of
    # the joints: the hip joint goes 3.5 cm and the knee 2 cm back of them
    J["hip" + side] = Vector((hx, float(np.polyval(fy, 0.64)) + HIP_BACK, HIP_Z))
    J["knee" + side] = Vector((float(np.polyval(fx, KNEE_Z)), float(np.polyval(fy, KNEE_Z)) + KNEE_BACK, KNEE_Z))
    J["ankle" + side] = Vector((float(ank[0] + fx[0] * (ANKLE_Z - 0.18)), float(ank[1]), ANKLE_Z))
    sole = (X * sgn > 0.05) & (Z < 0.04)
    J["toe" + side] = Vector((J["ankle" + side].x, float(np.percentile(Y[sole], 1)) + 0.02, 0.02))
# the sculpt is close to symmetric; mirror-average the leg joints so both legs match
for k in ("hip", "knee", "ankle", "toe"):
    a_, b_ = J[k + "L"], J[k + "R"]
    J[k + "L"] = Vector(((a_.x - b_.x) / 2, (a_.y + b_.y) / 2, (a_.z + b_.z) / 2))
    J[k + "R"] = Vector((-J[k + "L"].x, J[k + "L"].y, J[k + "L"].z))
J["hips"] = Vector((0, J["hipL"].y, 0.52 * H))

print("sculpt ankles across %.3f, hip joints across %.3f" % (J["ankleL"].x - J["ankleR"].x, J["hipL"].x - J["hipR"].x))
print("arm angle from vertical", {k: round(v, 1) for k, v in arm_angle.items()})

# ---------------------------------------------------------------- rest pose: legs together
def turn_y(v, ang):
    """Rotate row vectors about the Y axis by per-row angles (radians): x' = c x + s z."""
    c, s_ = np.cos(ang), np.sin(ang)
    return np.column_stack((c * v[:, 0] + s_ * v[:, 2], v[:, 1], -s_ * v[:, 0] + c * v[:, 2]))


new = co.copy()
for side, sgn in (("L", 1), ("R", -1)):
    hip, ank = np.array(J["hip" + side]), np.array(J["ankle" + side])
    d = ank - hip
    L = math.hypot(d[0], d[2])
    alpha = math.atan2(d[0], -d[2]) - math.asin(sgn * STANCE_OUT / L)
    # the whole leg below the crotch turns; the turn fades out up to the hip, and fades
    # near the centre line at the top of the thighs so the inner thighs do not cross
    sidem = (X * sgn > 0) & ((np.abs(X) < 0.3) | (Z < 0.3))
    wl = sidem * ramp(Z, 0.86, 0.70)
    wl = wl * (1 - (1 - ramp(np.abs(X), 0.0, 0.06)) * ramp(Z, 0.55, 0.70))
    new = hip + turn_y(new - hip, alpha * wl)
    ank2 = hip + turn_y(d[None], np.array([alpha]))[0]
    # the boot turns back about the new ankle so the sole stays flat on the ground
    wf = sidem * ramp(Z, 0.22, 0.14)
    new = ank2 + turn_y(new - ank2, -alpha * wf)
    knee = np.array(J["knee" + side])
    J["knee" + side] = Vector(hip + turn_y((knee - hip)[None], np.array([alpha]))[0])
    J["toe" + side] = Vector(ank2 + (np.array(J["toe" + side]) - ank))
    J["ankle" + side] = Vector(ank2)
    print("leg %s turned in %.1f deg" % (side, math.degrees(alpha)))
drop = new[:, 2].min()
new[:, 2] -= drop
for k in J:
    J[k] = J[k] - Vector((0, 0, drop))
co = new
X, Y, Z = co[:, 0], co[:, 1], co[:, 2]
mesh.data.vertices.foreach_set("co", co.ravel())
mesh.data.update()

for side, sgn in (("L", 1), ("R", -1)):
    sole = (X * sgn > 0.02) & (Z < 0.03)
    J["heel" + side] = float(np.percentile(Y[sole], 99))
    J["ball" + side] = J["heel" + side] + 0.73 * (float(np.percentile(Y[sole], 1)) - J["heel" + side])
    J["toetip" + side] = float(np.percentile(Y[sole], 1))
for k, v in J.items():
    if isinstance(v, Vector):
        print(f"joint {k:10s} {v.x:+.3f} {v.y:+.3f} {v.z:+.3f}")
print("rest ankles across %.3f, hip joints across %.3f" % (J["ankleL"].x - J["ankleR"].x, J["hipL"].x - J["hipR"].x))

# ---------------------------------------------------------------- skeleton
arm_data = bpy.data.armatures.new("Rig")
rig = bpy.data.objects.new("HackerRig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

BONES = [
    # name, head, tail, parent, connected
    ("Hips", "hips", "spine", None, False),
    ("Spine", "spine", "chest", "Hips", True),
    ("Chest", "chest", "neck", "Spine", True),
    ("Neck", "neck", "head", "Chest", True),
    ("Head", "head", "top", "Neck", True),
]
for side in ("L", "R"):
    BONES += [
        ("Shoulder." + side, "clav" + side, "shoulder" + side, "Chest", False),
        ("UpperArm." + side, "shoulder" + side, "elbow" + side, "Shoulder." + side, True),
        ("LowerArm." + side, "elbow" + side, "wrist" + side, "UpperArm." + side, True),
        ("Hand." + side, "wrist" + side, "tip" + side, "LowerArm." + side, True),
        ("UpLeg." + side, "hip" + side, "knee" + side, "Hips", False),
        ("Leg." + side, "knee" + side, "ankle" + side, "UpLeg." + side, True),
        ("Foot." + side, "ankle" + side, "toe" + side, "Leg." + side, True),
    ]
for name, h, t, parent, connect in BONES:
    eb = arm_data.edit_bones.new(name)
    eb.head, eb.tail = J[h], J[t]
    eb.align_roll(Vector((0, 0, 1)) if name.startswith("Foot") else Vector((0, -1, 0)))
    if parent:
        eb.parent = arm_data.edit_bones[parent]
        eb.use_connect = connect
bpy.ops.object.mode_set(mode="OBJECT")

names = [b[0] for b in BONES]
PARENT = {b[0]: b[3] for b in BONES}
REST_HEAD = {b.name: np.array(b.head_local) for b in arm_data.bones}
REST_TAIL = {b.name: np.array(b.tail_local) for b in arm_data.bones}
REST_R = {b.name: np.array(b.matrix_local.to_3x3()) for b in arm_data.bones}

# ---------------------------------------------------------------- skin weights
heads = np.array([REST_HEAD[nm] for nm in names])
tails = np.array([REST_TAIL[nm] for nm in names])
D = np.empty((n, len(names)))
for i in range(len(names)):
    ab = tails[i] - heads[i]
    t = np.clip(((co - heads[i]) @ ab) / (ab @ ab), 0, 1)
    D[:, i] = np.linalg.norm(co - (heads[i] + t[:, None] * ab), axis=1)

z = Z / H
MASK = np.ones((n, len(names)), bool)
for i, name in enumerate(names):
    side = name[-1] if "." in name else ""
    m = MASK[:, i]
    base = name.split(".")[0]
    if base in ("UpLeg", "Leg", "Foot"):
        if side == "L": m &= X > -0.012 * H
        if side == "R": m &= X < 0.012 * H
    elif side == "L": m &= X > 0
    elif side == "R": m &= X < 0
    if base == "UpLeg": m &= (z < 0.58)
    if base == "Leg": m &= (z < 0.36)
    if base == "Foot": m &= (z < 0.14)
    if base in ("Spine", "Chest", "Shoulder", "UpperArm", "LowerArm", "Hand"): m &= (z > 0.46)
    if base in ("Neck", "Head"): m &= (z > 0.78)
    if base == "Hips": m &= (z > 0.36) & (z < 0.70)
W = np.where(MASK, 1.0 / np.maximum(D, 0.008) ** 4, 0.0)
W[W.sum(1) == 0, 0] = 1.0
W /= W.sum(1, keepdims=True)

# vertices split at UV seams share a position; they must share weights too, so the
# smoothing runs on welded positions and the result is scattered back
keys = np.round(co / 1e-5).astype(np.int64)
_, uid = np.unique(keys, axis=0, return_inverse=True)
uid = uid.ravel()
nu = uid.max() + 1
ne = len(mesh.data.edges)
ed = np.empty(ne * 2, dtype=np.int64)
mesh.data.edges.foreach_get("vertices", ed)
ed = uid[ed.reshape(ne, 2)]
ed = ed[ed[:, 0] != ed[:, 1]]
cnt = np.bincount(uid, minlength=nu).astype(float)
Wu = np.stack([np.bincount(uid, W[:, i], nu) for i in range(len(names))], 1) / cnt[:, None]
Mu = np.zeros((nu, len(names)), bool)
Mu[uid] = MASK
deg = np.bincount(ed[:, 0], minlength=nu) + np.bincount(ed[:, 1], minlength=nu)
for it in range(8):
    acc = np.stack([np.bincount(ed[:, 0], Wu[ed[:, 1], i], nu) + np.bincount(ed[:, 1], Wu[ed[:, 0], i], nu)
                    for i in range(len(names))], 1)
    Wu = np.where(deg[:, None] > 0, 0.5 * Wu + 0.5 * acc / np.maximum(deg, 1)[:, None], Wu)
    Wu *= Mu
    Wu /= np.maximum(Wu.sum(1, keepdims=True), 1e-9)
W = Wu[uid]

# Distance to a bone's axis misleads wherever two parts of very different thickness sit
# side by side. A vertex on the side of the jacket or the hips is about as far from the
# forearm hanging beside it as from the spine, so it took a third of its weight from the
# arm and was dragged 10 cm or more when the arm lifted. Each bone gets a radius (the
# median distance of the vertices that are clearly nearest to it), and below the armpit
# a vertex goes to the forearm and hand or to the trunk by whichever surface is nearer,
# with a 5 cm blend where the two are about equally near. The upper arm keeps its plain
# distance weights: a sharp line between it and the chest tears the armpit open when
# the arm is raised.
Dm = np.where(MASK, D, np.inf)
srt = np.sort(Dm, 1)
nearest = np.argmin(Dm, 1)
clear = srt[:, 0] < 0.75 * srt[:, 1]
RADIUS = np.array([float(np.median(D[clear & (nearest == i), i])) if (clear & (nearest == i)).sum() > 20 else 0.05
                   for i in range(len(names))])
print("bone radii", {nm: round(float(r), 3) for nm, r in zip(names, RADIUS)})
IX = {nm: i for i, nm in enumerate(names)}
gap = np.where(MASK, D - RADIUS, 9.0)
armpit = J["shoulderL"].z - 0.16
below = ramp(Z, armpit + 0.04, armpit - 0.04)
FW = np.ones_like(W)
for side, sgn in (("L", 1), ("R", -1)):
    arm_ids = [IX[b + "." + side] for b in ("LowerArm", "Hand")]
    body_ids = [IX["Hips"], IX["Spine"], IX["UpLeg." + side]]
    on = np.nonzero(X * sgn > 0)[0]
    fa = ramp(gap[on][:, body_ids].min(1) - gap[on][:, arm_ids].min(1), -0.02, 0.03)
    FW[np.ix_(on, arm_ids)] *= (1 - (1 - fa) * below[on])[:, None]
    FW[np.ix_(on, body_ids)] *= (1 - fa * below[on])[:, None]
# The thigh lets go of the hips over the 10 cm above the hip joint (the crease runs about
# level with the joint at the side), so bending the hip no longer drags the waist; and
# the shin lets go of the boot below the ankle, so the sole is carried by the foot bone
# alone and stays planted while the foot is.
HIP_JZ, ANKLE_JZ = J["hipL"].z, J["ankleL"].z
for side in "LR":
    FW[:, IX["UpLeg." + side]] *= ramp(Z, HIP_JZ + 0.10, HIP_JZ)
    FW[:, IX["Leg." + side]] *= ramp(Z, ANKLE_JZ - 0.04, ANKLE_JZ + 0.01)
W2 = W * FW
W = np.where(W2.sum(1, keepdims=True) < 1e-6, W, W2)
W /= W.sum(1, keepdims=True)

K = 4
order = np.argsort(-W, axis=1)[:, :K]
w = np.take_along_axis(W, order, axis=1)
w[w < 0.02] = 0
w /= w.sum(1, keepdims=True)
w = np.round(w * 255) / 255     # the web copy stores 8-bit weights; bake that in now
w /= w.sum(1, keepdims=True)
SKIN_IDX, SKIN_W = order, w
DOMINANT = order[:, 0]

groups = {nm: mesh.vertex_groups.new(name=nm) for nm in names}
for k in range(K):
    for bi, nm in enumerate(names):
        sel = (order[:, k] == bi) & (w[:, k] > 0)
        if not sel.any():
            continue
        vals = np.round(w[sel, k], 4)
        idx = np.nonzero(sel)[0]
        for val in np.unique(vals):
            groups[nm].add(idx[vals == val].tolist(), float(val), "ADD")
mesh.parent = rig
mod = mesh.modifiers.new("Armature", "ARMATURE")
mod.object = rig
print("weights assigned")

# ---------------------------------------------------------------- pose maths
I3 = np.eye(3)
FWD, LEFT, UP, DOWN = np.array([0, -1.0, 0]), np.array([1.0, 0, 0]), np.array([0, 0, 1.0]), np.array([0, 0, -1.0])


def rot(axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 3, axis.upper()))


def turns(*seq):
    """Rotations about armature axes, in degrees, applied in order."""
    M = I3
    for axis, deg in seq:
        M = rot(axis, deg) @ M
    return M


def unit(v):
    return v / np.linalg.norm(v)


def perp(v, axis):
    return unit(v - (v @ axis) * axis)


def frame(a, f):
    u = unit(a)
    v = perp(f, u)
    return np.column_stack((u, v, np.cross(u, v)))


def frame_map(a0, f0, a1, f1):
    """The rotation taking direction a0 to a1 while f0 (a side reference) goes to f1."""
    return frame(a1, f1) @ frame(a0, f0).T


def slerp_m(A, B, t):
    qa, qb = Matrix(A.tolist()).to_quaternion(), Matrix(B.tolist()).to_quaternion()
    return np.array(qa.slerp(qb, t).to_matrix())


class Pose:
    """Absolute armature-space rotations (relative to rest) and bone heads, built root first."""

    def __init__(self, hips_offset=(0, 0, 0)):
        self.off = np.asarray(hips_offset, float)
        self.Ra, self.head = {}, {}

    def joint(self, name):
        p = PARENT[name]
        if p is None:
            return REST_HEAD[name] + self.off
        return self.head[p] + self.Ra[p] @ (REST_HEAD[name] - REST_HEAD[p])

    def local(self, name, Dm=I3):
        p = PARENT[name]
        self.head[name] = self.joint(name)
        self.Ra[name] = Dm if p is None else self.Ra[p] @ Dm

    def absolute(self, name, R):
        self.head[name] = self.joint(name)
        self.Ra[name] = R

    def tail(self, name):
        return self.head[name] + self.Ra[name] @ (REST_TAIL[name] - REST_HEAD[name])

    def copy(self):
        p = Pose(self.off)
        p.Ra, p.head = dict(self.Ra), dict(self.head)
        return p

    def finish(self):
        for nm in names:
            if nm not in self.Ra:
                self.local(nm)
        return self

    def basis(self, name):
        p = PARENT[name]
        Dm = self.Ra[name] if p is None else self.Ra[p].T @ self.Ra[name]
        Rb = REST_R[name]
        return Rb.T @ Dm @ Rb


def torso(pose, pelvis, chest_world, head_world):
    """Pelvis rotation, then Spine and Chest share the turn to the chest's world
    orientation, Neck and Head share the turn to the head's."""
    pose.local("Hips", pelvis)
    rel = pelvis.T @ chest_world
    half = slerp_m(I3, rel, 0.5)
    pose.local("Spine", half)
    pose.local("Chest", half.T @ rel)
    rel = pose.Ra["Chest"].T @ head_world
    half = slerp_m(I3, rel, 0.5)
    pose.local("Neck", half)
    pose.local("Head", half.T @ rel)


LEG_A = {s: np.linalg.norm(REST_TAIL["UpLeg." + s] - REST_HEAD["UpLeg." + s]) for s in "LR"}
LEG_B = {s: np.linalg.norm(REST_TAIL["Leg." + s] - REST_HEAD["Leg." + s]) for s in "LR"}


def leg(pose, side, ankle, foot_rot, pole):
    """Two-bone IK: thigh and shin reach the ankle target with the knee toward pole."""
    up, lo, ft = "UpLeg." + side, "Leg." + side, "Foot." + side
    hip = pose.joint(up)
    a, b = LEG_A[side], LEG_B[side]
    dv = ankle - hip
    dist = np.linalg.norm(dv)
    nrm = dv / dist
    dc = float(np.clip(dist, abs(a - b) + 1e-3, (a + b) * 0.99995))
    p = perp(pole, nrm)
    ca = (a * a + dc * dc - b * b) / (2 * a * dc)
    knee = hip + a * (ca * nrm + math.sqrt(max(0.0, 1 - ca * ca)) * p)
    end = hip + nrm * dc
    t0 = REST_TAIL[up] - REST_HEAD[up]
    s0 = REST_TAIL[lo] - REST_HEAD[lo]
    pose.absolute(up, frame_map(t0, FWD, knee - hip, p))
    pose.absolute(lo, frame_map(s0, FWD, end - knee, p))
    pose.absolute(ft, foot_rot)
    return dist / (a + b)


def reach_cap(pose_fn, feet, k):
    """How far the hips may rise (negative: must drop) before a leg straightens past k."""
    pose = pose_fn()
    cap = 1.0
    for side, ankle in feet.items():
        hip = pose.joint("UpLeg." + side)
        L = (LEG_A[side] + LEG_B[side]) * k
        h2 = (ankle[0] - hip[0]) ** 2 + (ankle[1] - hip[1]) ** 2
        top = ankle[2] + math.sqrt(max(L * L - h2, 1e-6))
        cap = min(cap, top - hip[2])
    return cap


def hang(bone):
    return frame_map(REST_TAIL[bone] - REST_HEAD[bone], FWD, DOWN, FWD)


HANG = {nm: hang(nm) for nm in names if nm.split(".")[0] in ("UpperArm", "LowerArm", "Hand")}


def arm(pose, side, flex, abd, twist, elbow, pron=0.0, wflex=0.0, wdev=0.0, shrug=(0.0, 0.0)):
    """Arm from anatomical angles, degrees, measured from a relaxed hanging arm:
    flex forward, abd out to the side, twist internal, elbow bend, pron forearm
    pronation (shared between forearm and hand), wflex wrist toward the palm,
    wdev wrist toward the thumb, shrug = (clavicle raise, clavicle forward)."""
    sg = 1 if side == "L" else -1
    pose.local("Shoulder." + side, turns(("y", -sg * shrug[0]), ("z", -sg * shrug[1])))
    S = pose.Ra["Shoulder." + side]
    upper = S @ rot("x", -flex) @ rot("y", -sg * abd) @ rot("z", -sg * twist)
    pose.absolute("UpperArm." + side, upper @ HANG["UpperArm." + side])
    fore = upper @ rot("x", -elbow)
    pose.absolute("LowerArm." + side, fore @ rot("z", -sg * pron * 0.5) @ HANG["LowerArm." + side])
    pose.absolute("Hand." + side, fore @ rot("z", -sg * pron) @ rot("y", sg * wflex) @ rot("x", -wdev) @ HANG["Hand." + side])


def reach_arm(pose, side, target, pref, lam=0.0025, **kw):
    """Solve flex, abd, twist, elbow so the wrist lands on target, staying near pref."""
    pref = np.array(pref, float)
    p = pref.copy()

    def resid(q):
        tp = pose.copy()
        arm(tp, side, *q, **kw)
        return np.concatenate((tp.head["Hand." + side] - target, lam * (q - pref)))

    for _ in range(60):
        r = resid(p)
        Jm = np.empty((len(r), 4))
        for j in range(4):
            dq = np.zeros(4)
            dq[j] = 0.2
            Jm[:, j] = (resid(p + dq) - r) / 0.2
        step = np.linalg.solve(Jm.T @ Jm + 1e-7 * np.eye(4), Jm.T @ r)
        p = p - step
        p[3] = float(np.clip(p[3], 0, 150))
        if np.abs(step).max() < 1e-3:
            break
    arm(pose, side, *p, **kw)
    return np.linalg.norm(pose.head["Hand." + side] - target)


def spline(ks, vs, d0, d1, s):
    """Cubic Hermite through knots ks/values vs with end slopes d0, d1."""
    nk = len(ks)
    tg = [d0] + [(vs[i + 1] - vs[i - 1]) / (ks[i + 1] - ks[i - 1]) for i in range(1, nk - 1)] + [d1]
    i = min(max(j for j in range(nk - 1) if ks[j] <= s), nk - 2)
    h = ks[i + 1] - ks[i]
    t = (s - ks[i]) / h
    return ((2 * t ** 3 - 3 * t ** 2 + 1) * vs[i] + (t ** 3 - 2 * t ** 2 + t) * h * tg[i]
            + (-2 * t ** 3 + 3 * t ** 2) * vs[i + 1] + (t ** 3 - t ** 2) * h * tg[i + 1])


def smooth_loop(a, passes):
    for _ in range(passes):
        a = 0.25 * np.roll(a, 1) + 0.5 * a + 0.25 * np.roll(a, -1)
    return a


# foot points on the sole, relative to the ankle, in the rest orientation
FOOT = {}
for side in "LR":
    ank = REST_HEAD["Foot." + side]
    FOOT[side] = {k: np.array([0.0, J[k + side] - ank[1], -ank[2]]) for k in ("heel", "ball", "toetip")}
REST_ANKLE = {s: REST_HEAD["Foot." + s] for s in "LR"}
SIDES = (("L", 1), ("R", -1))
TAU = 2 * math.pi
# the boot sole and toe cap, relative to the ankle; below the ankle the boot follows the
# foot bone only, so these points move rigidly with it
SOLE = {s: co[(X * sg > 0.02) & (Z < 0.06)] - REST_ANKLE[s] for s, sg in SIDES}


def ground_ankle(side, R):
    """Ankle height that puts the lowest point of the boot, turned by R, on the floor."""
    return -float((SOLE[side] @ R.T)[:, 2].min())


def foot_rot(pitch, yaw):
    """pitch: toe up positive; yaw: toe toward +X positive."""
    return turns(("x", -pitch), ("z", yaw))


# ---------------------------------------------------------------- clips
def idle_poses(N):
    feet = {s: REST_ANKLE[s].copy() for s in "LR"}
    out = []
    pel, zs = [], []
    for f in range(N):
        t = f / N
        P = turns(("x", 1.0), ("y", -1.6 * math.sin(TAU * t)), ("z", 1.4 * math.sin(TAU * t + 0.8)))
        off = np.array([0.013 * math.sin(TAU * t), 0.004 * math.sin(TAU * 2 * t), 0.0])
        pel.append((P, off))

        def mk(P=P, off=off):
            p = Pose(off)
            p.local("Hips", P)
            return p
        zs.append(min(0.0, reach_cap(mk, feet, 0.993)))
    zs = np.array(zs)
    for _ in range(4):
        zs = np.minimum(smooth_loop(zs, 3), zs)
    for f in range(N):
        t = f / N
        P, off = pel[f]
        pose = Pose(off + [0, 0, zs[f]])
        chest = turns(("x", 1.5 + 1.0 * math.sin(TAU * t)), ("y", 1.0 * math.sin(TAU * t)), ("z", -1.2 * math.sin(TAU * t + 0.8)))
        head = turns(("x", 2.5 + 1.0 * math.sin(TAU * 2 * t)), ("z", 7 * math.sin(TAU * t + 0.4)))
        torso(pose, P, chest, head)
        for side, sg in SIDES:
            b = math.sin(TAU * t + 0.5 + (0.6 if side == "R" else 0))
            arm(pose, side, flex=3 + 1.5 * b, abd=13, twist=4, elbow=13 + 2.5 * b, pron=-10, wflex=6)
        for side, sg in SIDES:
            leg(pose, side, feet[side], foot_rot(0, sg * 6), FWD + sg * 0.1 * LEFT)
        out.append(pose.finish())
    return out


GAITS = {
    # the boot rolls on its real heel and toe cap, so the ankle sits lower at heel strike and
    # toe-off than a point pivot would put it; a 1.24 m stride (1.16 m/s) keeps the pelvis
    # moving about 5 cm up and down instead of 6
    "Walk": dict(frames=64, stride=1.24, duty=0.62, width=0.085, toe_out=6, u_mid=0.30, w_mid=0.05,
                 hs=16, flat=0.09, heel_off=0.30, to=42,
                 swing=[(0.26, 0.205, 0.22, -22), (0.58, 0.135, 0.66, 3), (0.86, 0.130, 0.97, 12)],
                 k=0.998, base=(0.0, 0.04), sway=0.02, yaw=7, drop=4, tilt=3, chest_yaw=6, lean=3,
                 arm=15, arm_fwd=2, arm_lag=0.04, elbow=14, elbow_fwd=14, abd=19, twist=8, head=3),
    # a 3.1 m/s jog, not a sprint: the swing foot rises to about knee height behind and
    # passes low, so the thigh comes up about 50 degrees, and the fists stay below the chest
    "Run": dict(frames=42, stride=2.2, duty=0.36, width=0.055, toe_out=4, u_mid=0.17, w_mid=0.02,
                hs=8, flat=0.05, heel_off=0.17, to=46,
                swing=[(0.24, 0.25, 0.10, -30), (0.52, 0.24, 0.50, -10), (0.80, 0.15, 0.98, 4)],
                k=0.985, base=(-0.01, 0.07), sway=0.012, yaw=8, drop=4, tilt=9, chest_yaw=11, lean=11,
                arm=26, arm_fwd=4, arm_lag=0.03, elbow=82, elbow_fwd=6, abd=16, twist=4, head=-6),
}
GAIT_INFO = {}


def gait_poses(g):
    N, S, duty = g["frames"], g["stride"], g["duty"]
    eps = 1e-4

    def stance(side, sg, u):
        """Ankle and pitch of a foot on the ground. The heel and toe landmarks set where the
        foot rolls; the height comes from the boot itself, so the lowest point of the sole
        touches the floor at every pitch (a rounded heel or toe cap would otherwise float
        above it or sink into it)."""
        yaw = sg * g["toe_out"]
        F = FOOT[side]
        heel_w = g["w_mid"] - F["heel"][1] + S * (g["u_mid"] - u)
        pivot = np.array([sg * g["width"], -heel_w, 0.0])
        if u < g["heel_off"]:
            pitch = g["hs"] * (1 - float(smooth01(u / g["flat"]))) if u < g["flat"] else 0.0
            R = foot_rot(pitch, yaw)
            a = pivot - R @ F["heel"]
        else:
            # the boot has no toe joint, so the heel rises about the front of the sole
            s_ = (u - g["heel_off"]) / (duty - g["heel_off"])
            pitch = -g["to"] * s_ ** 1.7
            R = foot_rot(pitch, yaw)
            tip = pivot + rot("z", yaw) @ (F["toetip"] - F["heel"])
            a = tip - R @ F["toetip"]
        a[2] = ground_ankle(side, R)
        return a, pitch

    def foot_at(side, sg, u):
        u = u % 1.0
        if u < duty:
            return stance(side, sg, u)
        s_ = (u - duty) / (1 - duty)
        a0, p0 = stance(side, sg, duty)
        am, pm = stance(side, sg, duty - eps)
        a1, p1 = stance(side, sg, 0.0)
        ap, pp = stance(side, sg, eps)
        sc = (1 - duty) / eps
        ks = [0.0] + [k[0] for k in g["swing"]] + [1.0]
        zs_ = [a0[2]] + [k[1] for k in g["swing"]] + [a1[2]]
        ws = [-a0[1]] + [-a0[1] + k[2] * (a0[1] - a1[1]) for k in g["swing"]] + [-a1[1]]
        ps = [p0] + [k[3] for k in g["swing"]] + [p1]
        zz = spline(ks, zs_, (a0[2] - am[2]) * sc, (ap[2] - a1[2]) * sc, s_)
        ww = spline(ks, ws, -(a0[1] - am[1]) * sc, -(ap[1] - a1[1]) * sc, s_)
        pt = spline(ks, ps, (p0 - pm) * sc, (pp - p1) * sc, s_)
        return np.array([sg * g["width"], -ww, zz]), pt

    frames = []
    for f in range(N):
        t = f / N
        P = turns(("x", g["tilt"]), ("y", -g["drop"] * math.sin(TAU * (t + 0.03))), ("z", -g["yaw"] * math.cos(TAU * t)))
        off = np.array([g["sway"] * math.cos(TAU * (t - g["u_mid"])), 0.0, 0.0])
        feet, pitch = {}, {}
        for side, sg in SIDES:
            u = t if side == "L" else t + 0.5
            feet[side], pitch[side] = foot_at(side, sg, u)
        frames.append(dict(t=t, P=P, off=off, feet=feet, pitch=pitch))

    zs = []
    for fr in frames:
        if g["base"]:
            lo_, dip = g["base"]
            bump = 0.5 + 0.5 * math.cos(TAU * 2 * (fr["t"] - g["u_mid"]))
            base = lo_ - dip * bump
        else:
            base = 0.0

        def mk(fr=fr, base=base):
            p = Pose(fr["off"] + [0, 0, base])
            p.local("Hips", fr["P"])
            return p
        zs.append(base + min(0.0, reach_cap(mk, fr["feet"], g["k"])))
    zs = np.array(zs)
    caps = zs.copy()
    for _ in range(5):
        zs = np.minimum(smooth_loop(zs, 3), caps)

    out = []
    for fr, zo in zip(frames, zs):
        t = fr["t"]
        pose = Pose(fr["off"] + [0, 0, zo])
        chest = turns(("x", g["lean"]), ("z", g["chest_yaw"] * math.cos(TAU * t)))
        head = turns(("x", g["head"] + 1.0 * math.cos(TAU * 2 * t)))
        torso(pose, fr["P"], chest, head)
        for side, sg in SIDES:
            c = math.cos(TAU * (t - g["arm_lag"])) * (-1 if side == "L" else 1)
            flex = g["arm_fwd"] + g["arm"] * c
            arm(pose, side, flex=flex, abd=g["abd"], twist=g["twist"], elbow=g["elbow"] + g["elbow_fwd"] * max(0.0, c),
                pron=15, wflex=8, shrug=(0.0, 3 * c))
        for side, sg in SIDES:
            leg(pose, side, fr["feet"][side], foot_rot(fr["pitch"][side], sg * g["toe_out"]),
                rot("z", sg * g["toe_out"]) @ FWD)
        out.append(pose.finish())
    GAIT_INFO[g["frames"]] = dict(speed=S * FPS / N)
    return out


POINT_BONES = ["Chest", "Neck", "Head", "Shoulder.R", "UpperArm.R", "LowerArm.R", "Hand.R"]


def point_poses(N, base=None):
    out = []
    for f in range(N):
        t = f / N
        settle = math.sin(TAU * t)
        pose = base[f % len(base)].copy() if base else Pose()
        if not base:
            pose.local("Hips")
            pose.local("Spine")
        pose.head.pop("Chest", None)
        rel = turns(("x", -1.5), ("z", -7 + 0.6 * settle))
        pose.local("Chest", rel)
        head = pose.Ra["Chest"] @ turns(("x", 3), ("z", -8 + 1.0 * settle))
        half = slerp_m(I3, pose.Ra["Chest"].T @ head, 0.5)
        pose.local("Neck", half)
        pose.local("Head", half.T @ pose.Ra["Chest"].T @ head)
        if base:
            # the left arm keeps the base clip's local pose under the new chest
            for nm in ("Shoulder.L", "UpperArm.L", "LowerArm.L", "Hand.L"):
                Dm = base[f % len(base)].Ra[PARENT[nm]].T @ base[f % len(base)].Ra[nm]
                pose.local(nm, Dm)
        # there are no finger bones, so the open hand is held thumb up with the palm facing
        # in, edge on to the spot like a hand showing the way; palm down it reads as reaching
        arm(pose, "R", flex=86 + 1.2 * settle, abd=-4, twist=-6, elbow=9 - 1.0 * settle, pron=-18,
            wflex=0, wdev=0, shrug=(7, 6))
        if base:
            for nm in names:
                if nm.startswith(("UpLeg", "Leg", "Foot")):
                    Dm = base[f % len(base)].Ra[PARENT[nm]].T @ base[f % len(base)].Ra[nm]
                    pose.local(nm, Dm)
        out.append(pose.finish())
    return out


# The baggy trousers put the underside of the thigh about 0.1 m below the hip joint once
# the hip bends, and the shins are short, so on a 0.46 m seat the thighs slope a few
# degrees toward the knee. contact: where the underside of the pelvis settles;
# knee: inner knee angle the feet are placed for (98 keeps the shins about vertical).
SIT = dict(hip_w=-0.02, tilt=-4, ankle_x=0.13, ankle_w=0.35, toe_out=8, contact=SEAT, knee=98.0)
# SitType: the gloves hover palm down over the keys with the wrists just in front of the
# keyboard, and the forearms cross the desk edge above the desk top. The sculpt's arms are
# short (0.45 m shoulder to wrist), so the chest leans in 22 degrees. wrist_z is solved
# below from the glove mesh, so the solve aims the hand and not only the wrist joint.
TYPE = dict(lean=22, pron=40, wflex=-5, across=0.12, wrist_fwd=0.37, wrist_z=0.83,
            pref=[30, 20, 25, 90], shrug=(4, 18))


def sit_lower(pose_off):
    pose = Pose(pose_off)
    pose.local("Hips", turns(("x", SIT["tilt"])))
    return pose


def sit_legs(pose):
    for side, sg in SIDES:
        ank = np.array([sg * SIT["ankle_x"], -SIT["ankle_w"], REST_ANKLE[side][2]])
        leg(pose, side, ank, foot_rot(0, sg * SIT["toe_out"]), unit(FWD + UP + sg * 0.15 * LEFT))


def sit_pose(t, zoff, typing, taps=True):
    off = np.array([0.0, -(SIT["hip_w"] + REST_HEAD["UpLeg.L"][1]), zoff])
    pose = Pose(off)
    pelvis = turns(("x", SIT["tilt"]))
    if typing:
        chest = turns(("x", TYPE["lean"] + 0.6 * math.sin(TAU * t)), ("z", 0.8 * math.sin(TAU * t)))
        head = turns(("x", 4 + 1.2 * math.sin(TAU * 2 * t)), ("z", 2 * math.sin(TAU * t)))
    else:
        chest = turns(("x", 10 + 1.0 * math.sin(TAU * t)), ("y", 0.8 * math.sin(TAU * t + 1)))
        head = turns(("x", 4 + 1.0 * math.sin(TAU * t + 0.5)), ("z", 6 * math.sin(TAU * t + 0.3)))
    torso(pose, pelvis, chest, head)
    for side, sg in SIDES:
        if typing:
            ph = {"L": 0.0, "R": 1.7}[side]
            # key taps only ever lift the hand (0 to 8 mm), so they cannot push it into the keys
            tap = 0.002 * (2 + math.sin(TAU * 4 * t + ph) + math.sin(TAU * 7 * t + 2 * ph)) if taps else 0.0
            drift = 0.008 * math.sin(TAU * t + ph) if taps else 0.0
            target = np.array([sg * (TYPE["across"] + drift), -TYPE["wrist_fwd"], TYPE["wrist_z"] + tap])
            reach_arm(pose, side, target, TYPE["pref"], pron=TYPE["pron"], wflex=TYPE["wflex"], shrug=TYPE["shrug"])
        else:
            b = math.sin(TAU * t + (0.0 if side == "L" else 0.9))
            target = np.array([sg * 0.15, -(SIT["hip_w"] + 0.20), SEAT + 0.17 + 0.004 * b])
            reach_arm(pose, side, target, [25, 12, 20, 40], pron=60, wflex=8, shrug=(0, 4))
    sit_legs(pose)
    return pose.finish()


def skin(pose):
    Mv = np.zeros_like(co)
    for bi, nm in enumerate(names):
        R = pose.Ra[nm]
        tv = pose.head[nm] - R @ REST_HEAD[nm]
        for k in range(K):
            sel = SKIN_IDX[:, k] == bi
            if sel.any():
                Mv[sel] += SKIN_W[sel, k][:, None] * (co[sel] @ R.T + tv)
    return Mv


PELVIS_BONES = [names.index(nm) for nm in ("Hips", "UpLeg.L", "UpLeg.R")]
PELVIS_VERTS = np.isin(DOMINANT, PELVIS_BONES) & (np.abs(X) < 0.25) & (Z > 0.6)


def seat_contact(verts, show=False):
    """Lowest point of the pelvis: the seat area under and behind the hip joints (w -0.18 to 0.06)."""
    m = PELVIS_VERTS & (verts[:, 1] < 0.18) & (verts[:, 1] > -0.06)
    if show:
        idx = np.nonzero(m)[0][np.argsort(verts[m, 2])[:6]]
        for i in idx:
            print("  seat vertex rest", np.round(co[i], 3), "posed", np.round(verts[i], 3), names[DOMINANT[i]])
    return float(verts[m, 2].min())


def knee_angle(pose, side="L"):
    k = pose.head["Leg." + side]
    a_, b_ = pose.head["UpLeg." + side] - k, pose.head["Foot." + side] - k
    return math.degrees(math.acos(a_ @ b_ / np.linalg.norm(a_) / np.linalg.norm(b_)))


def place_feet(zo):
    """Move the feet forward or back until the knee reaches SIT['knee'] at this hip height."""
    lo_, hi_ = 0.2, 0.7
    for _ in range(30):
        SIT["ankle_w"] = (lo_ + hi_) / 2
        if knee_angle(sit_pose(0.0, zo, False)) < SIT["knee"]:
            lo_ = SIT["ankle_w"]
        else:
            hi_ = SIT["ankle_w"]


# the seated hips height is solved so the underside of the pelvis rests on the seat,
# with the feet re-placed at every step so the knees stay near 90 degrees
def contact_at(zo):
    place_feet(zo)
    return seat_contact(skin(sit_pose(0.0, zo, False)))


z0, z1 = SEAT + 0.08 - REST_HEAD["UpLeg.L"][2], SEAT + 0.12 - REST_HEAD["UpLeg.L"][2]
c0, c1 = contact_at(z0), contact_at(z1)
for it in range(10):
    zoff = z1 + (SIT["contact"] - c1) * (z1 - z0) / (c1 - c0)
    c = contact_at(zoff)
    print("sit solve", it, "contact %.4f ankle forward %.3f" % (c, SIT["ankle_w"]))
    z0, c0, z1, c1 = z1, c1, zoff, c
    if abs(c - SIT["contact"]) < 5e-4:
        break
SIT["zoff"] = zoff
seat_contact(skin(sit_pose(0.0, zoff, False)), show=True)

# the typing wrist height: the lowest point of either glove sits KEY_CLEAR above the key tops
HAND_VERTS = np.isin(DOMINANT, [IX["Hand.L"], IX["Hand.R"]])


def glove_low(z):
    TYPE["wrist_z"] = z
    return float(skin(sit_pose(0.0, SIT["zoff"], True, taps=False))[HAND_VERTS, 2].min())


za, zb = 0.80, 0.85
ha, hb = glove_low(za), glove_low(zb)
for it in range(10):
    zc = zb + (KEYS["top"] + KEY_CLEAR - hb) * (zb - za) / (hb - ha)
    za, ha, zb, hb = zb, hb, zc, glove_low(zc)
    if abs(hb - KEYS["top"] - KEY_CLEAR) < 5e-4:
        break
print("typing wrist height %.3f, lowest glove point %.3f" % (TYPE["wrist_z"], hb))

# ---------------------------------------------------------------- bake
scene = bpy.context.scene
scene.render.fps = FPS
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
PB = rig.pose.bones
for pb in PB:
    pb.rotation_mode = "QUATERNION"


def reset_pose():
    for pb in PB:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
        pb.scale = Vector((1, 1, 1))


def bake(name, poses, bones=None):
    reset_pose()
    rig.animation_data_create()
    rig.animation_data.action = None
    keyed = bones or names
    prev = {}
    N = len(poses)
    for f in range(N + 1):
        pose = poses[f % N]
        for nm in keyed:
            q = Matrix(pose.basis(nm).tolist()).to_quaternion()
            if nm in prev and prev[nm].dot(q) < 0:
                q.negate()
            prev[nm] = q
            PB[nm].rotation_quaternion = q
            PB[nm].keyframe_insert("rotation_quaternion", frame=f, group=nm)
        if "Hips" in keyed:
            PB["Hips"].location = Vector(REST_R["Hips"].T @ pose.off)
            PB["Hips"].keyframe_insert("location", frame=f, group="Hips")
    act = rig.animation_data.action
    act.name = name
    act.use_fake_user = True
    print("clip", name, N, "frames", "%.3f s" % (N / FPS))
    return act


POSES = {}
POSES["Idle"] = idle_poses(240)
POSES["Walk"] = gait_poses(GAITS["Walk"])
POSES["Run"] = gait_poses(GAITS["Run"])
POSES["Point"] = point_poses(120)
POSES["Sit"] = [sit_pose(f / 240, SIT["zoff"], False) for f in range(240)]
POSES["SitType"] = [sit_pose(f / 120, SIT["zoff"], True) for f in range(120)]
POINT_PREVIEW = point_poses(120, POSES["Idle"][::2])   # Point over Idle, as the site plays it
CLIPS = ["Idle", "Walk", "Run", "Point", "Sit", "SitType"]
ACTS = {}
for clip in CLIPS:
    ACTS[clip] = bake(clip, POSES[clip], POINT_BONES if clip == "Point" else None)


def use(act):
    reset_pose()
    rig.animation_data.action = act
    if getattr(act, "slots", None) and len(act.slots):
        rig.animation_data.action_slot = act.slots[0]


# ---------------------------------------------------------------- measure
bpy.ops.object.mode_set(mode="OBJECT")
report = {"ok": True, "fails": [], "clips": {}}


def fail(msg):
    report["ok"] = False
    report["fails"].append(msg)
    print("FAIL", msg)


def bone_head(nm):
    return np.array(PB[nm].head, dtype=float)


def bone_tail(nm):
    return np.array(PB[nm].tail, dtype=float)


def eval_verts():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    me = ev.to_mesh()
    arr = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", arr)
    ev.to_mesh_clear()
    return arr.reshape(-1, 3)


FOOT_VERTS = {s: np.isin(DOMINANT, [names.index("Foot." + s), names.index("Leg." + s)]) & (Z < 0.2) for s in "LR"}
SOLE_VERTS = {s: (X * sg > 0.02) & (Z < 0.03) for s, sg in SIDES}
HAND_V = {s: DOMINANT == IX["Hand." + s] for s in "LR"}
FOREARM_HAND = np.isin(DOMINANT, [IX[b + "." + s] for b in ("LowerArm", "Hand") for s in "LR"])
HIP_V = np.isin(DOMINANT, [IX["Hips"], IX["UpLeg.L"], IX["UpLeg.R"]])
EDGES = np.empty(len(mesh.data.edges) * 2, dtype=np.int64)
mesh.data.edges.foreach_get("vertices", EDGES)
EDGES = EDGES.reshape(-1, 2)
EDGE_REST = np.linalg.norm(co[EDGES[:, 0]] - co[EDGES[:, 1]], axis=1)
EDGE_FAIL = 0.08
# the palm normal: the thinnest direction of the rest-pose right glove, in the hand bone's frame
_glove = (co[HAND_V["R"]] - REST_HEAD["Hand.R"]) @ REST_R["Hand.R"]
PALM_R = np.linalg.svd(_glove - _glove.mean(0), full_matrices=False)[2][2]


def edge_growth(V):
    """The most any mesh edge stretches against the rest pose, and how many stretch over 5 cm."""
    g = np.linalg.norm(V[EDGES[:, 0]] - V[EDGES[:, 1]], axis=1) - EDGE_REST
    return float(g.max()), int((g > 0.05).sum())


def hands_in_hips(V, cell=0.012):
    """Hand vertices inside the outline of the hips and thighs: at the same height and depth
    (within a cell either way), further out than the inner surface and more than 1 cm
    inside the outer one."""
    count = 0
    for s, sg in SIDES:
        hips = V[HIP_V & (V[:, 0] * sg > 0)]
        kz = np.floor(hips[:, 2] / cell).astype(np.int64)
        ky = np.floor(hips[:, 1] / cell).astype(np.int64)
        keys = np.concatenate([(kz + dz) * 100000 + ky + dy for dz in (-1, 0, 1) for dy in (-1, 0, 1)])
        ax = np.tile(np.abs(hips[:, 0]), 9)
        uk, inv = np.unique(keys, return_inverse=True)
        lo_, hi_, cnt = np.full(len(uk), 9.0), np.full(len(uk), -9.0), np.zeros(len(uk))
        np.minimum.at(lo_, inv, ax)
        np.maximum.at(hi_, inv, ax)
        np.add.at(cnt, inv, 1)
        hv = V[HAND_V[s]]
        hk = np.floor(hv[:, 2] / cell).astype(np.int64) * 100000 + np.floor(hv[:, 1] / cell).astype(np.int64)
        pos = np.clip(np.searchsorted(uk, hk), 0, len(uk) - 1)
        hx = np.abs(hv[:, 0])
        count += int(((uk[pos] == hk) & (cnt[pos] >= 4) & (lo_[pos] < hx) & (hx < hi_[pos] - 0.01)).sum())
    return count


for clip in CLIPS:
    use(ACTS[clip])
    N = len(POSES[clip])
    info = {"frames": N, "seconds": round(N / FPS, 4)}
    gait = clip in ("Walk", "Run")
    step = 1 if gait else 4
    vstep = 1 if gait else (4 if clip.startswith("Sit") else 8)
    rows, VS, grow = [], {}, []
    for f in range(0, N, step):
        scene.frame_set(f)
        r = {"f": f}
        for nm in ("Foot.L", "Foot.R", "UpLeg.L", "UpLeg.R", "Hand.L", "Hand.R", "Hips", "UpperArm.R"):
            r[nm] = bone_head(nm)
        r["toe.L"], r["toe.R"] = bone_tail("Foot.L"), bone_tail("Foot.R")
        r["knee.L"], r["knee.R"] = bone_head("Leg.L"), bone_head("Leg.R")
        if clip != "Point" and f % vstep == 0:
            v = eval_verts()
            r["footmin.L"] = float(v[FOOT_VERTS["L"], 2].min())
            r["footmin.R"] = float(v[FOOT_VERTS["R"], 2].min())
            grow.append(edge_growth(v))
            if gait:
                VS[f] = v
                r["hand_top"] = float(v[HAND_V["L"] | HAND_V["R"], 2].max())
                if clip == "Walk" and f % 2 == 0:
                    r["hands_in_hips"] = hands_in_hips(v)
            if clip.startswith("Sit"):
                r["seat"] = seat_contact(v)
                # how far the thighs dip below the seat top over the front of a 0.44 m seat
                tm = PELVIS_VERTS & (v[:, 1] < -0.06) & (v[:, 1] > -0.22)
                r["thigh_under_seat_front"] = float(v[tm, 2].min())
                # the bench desk top, keyboard and the gloves over them
                fw = -v[:, 1]
                over = fw > DESK["front"]
                r["desk_slab"] = int((over & (v[:, 2] > DESK["top"] - DESK["thick"]) & (v[:, 2] < DESK["top"])).sum())
                r["arm_under_desk"] = int((FOREARM_HAND & over & (v[:, 2] < DESK["top"])).sum())
                r["in_keyboard"] = int(((np.abs(v[:, 0]) < KEYS["width"] / 2) & (np.abs(fw - KEYS["forward"]) < KEYS["depth"] / 2)
                                        & (v[:, 2] < KEYS["top"]) & (v[:, 2] > DESK["top"] - DESK["thick"])).sum())
                hm = HAND_V["L"] | HAND_V["R"]
                r["glove_low"] = float(v[hm, 2].min())
                r["glove_fwd"] = (float(fw[hm].min()), float(np.percentile(fw[hm], 98)))
            # model-validation: the numpy skin must match Blender's deform
            if f == 0:
                info["skin_vs_blender_max_m"] = round(float(np.abs(skin(POSES[clip][0]) - v).max()), 5)
        rows.append(r)
    if grow:
        info["edge_growth_max_m"] = round(max(g_[0] for g_ in grow), 4)
        info["edges_over_5cm_max"] = max(g_[1] for g_ in grow)

    if clip in ("Idle", "Walk", "Run"):
        across = max(abs(r["Foot.L"][0] - r["Foot.R"][0]) for r in rows)
        hips = min(abs(r["UpLeg.L"][0] - r["UpLeg.R"][0]) for r in rows)
        worst = max(abs(r["Foot.L"][0] - r["Foot.R"][0]) - abs(r["UpLeg.L"][0] - r["UpLeg.R"][0]) for r in rows)
        info["ankles_across_max_m"] = round(across, 4)
        info["hip_joints_across_m"] = round(hips, 4)
        info["ankles_minus_hips_max_m"] = round(worst, 4)
        if worst > 0.06:
            fail(f"{clip}: ankles {worst:.3f} m wider than hips")
        low = min(min(r["Foot.L"][2], r["Foot.R"][2], r["toe.L"][2], r["toe.R"][2]) for r in rows)
        vlow = min(min(r["footmin.L"], r["footmin.R"]) for r in rows if "footmin.L" in r)
        info["lowest_foot_bone_m"] = round(low, 4)
        info["lowest_foot_vertex_m"] = round(vlow, 4)
        if low < -0.01 or vlow < -0.003:
            fail(f"{clip}: foot below ground ({low:.3f} bone, {vlow:.3f} vertex)")
    if clip in ("Walk", "Run"):
        speeds = []
        for side in "LR":
            hz = np.array([r["Foot." + side][2] for r in rows])
            tz = np.array([r["toe." + side][2] for r in rows])
            ys = np.array([r["Foot." + side][1] for r in rows])
            xs = np.array([r["Foot." + side][0] for r in rows])
            # flat on the floor: the foot level as at rest, and the ankle at its lowest level height
            # (the ankle dips lower while the heel or toe rolls, so the lowest frame overall is not flat)
            level = np.abs((tz - hz) - (REST_TAIL["Foot." + side][2] - REST_HEAD["Foot." + side][2])) < 0.004
            flat = level & (hz < hz[level].min() + 0.002)
            idx = np.nonzero(flat)[0]
            # the longest run of consecutive flat frames (wrapping) is the contact window
            runs, cur = [], [idx[0]]
            for a_, b_ in zip(idx[:-1], idx[1:]):
                if b_ == a_ + 1:
                    cur.append(b_)
                else:
                    runs.append(cur)
                    cur = [b_]
            runs.append(cur)
            win = max(runs, key=len)
            tt = np.array(win) / FPS
            slope = np.polyfit(tt, ys[win], 1)[0]
            speeds.append(slope)
            info["contact_frames_" + side] = [int(win[0]), int(win[-1])]
            info["contact_side_drift_m_" + side] = round(float(np.ptp(xs[win])), 5)
            info["contact_fit_residual_m_" + side] = round(float(np.abs(np.polyval(np.polyfit(tt, ys[win], 1), tt) - ys[win]).max()), 5)
            # the planted sole: the points on the floor in the middle of the contact window
            # must travel as far as the ankle does, and stay on the floor
            f0, f1 = rows[win[0]]["f"], rows[win[-1]]["f"]
            vm = VS[rows[win[len(win) // 2]]["f"]]
            pick = np.nonzero(SOLE_VERTS[side] & (vm[:, 2] < vm[SOLE_VERTS[side], 2].min() + 0.006))[0]
            slip = float(np.median(VS[f1][pick, 1] - VS[f0][pick, 1])) - slope * (f1 - f0) / FPS
            lift = max(float(np.median(VS[rows[i]["f"]][pick, 2])) for i in win) - float(np.median(vm[pick, 2]))
            info["sole_slip_m_" + side] = round(slip, 4)
            info["sole_lift_in_contact_m_" + side] = round(lift, 4)
            if abs(slip) > 0.005:
                fail(f"{clip}: planted sole {side} slides {slip * 100:.1f} cm")
        info["ground_speed_mps"] = round(float(np.mean(speeds)), 4)
        info["authored_speed_mps"] = round(GAITS[clip]["stride"] * FPS / GAITS[clip]["frames"], 4)
        pel = np.array([r["Hips"][2] for r in rows])
        info["pelvis_bob_m"] = round(float(np.ptp(pel)), 4)
        if clip == "Walk" and np.ptp(pel) > 0.055:
            fail(f"Walk: pelvis bobs {np.ptp(pel):.3f} m")
        # mid-swing clearance: lowest point of the foot in the air, leaving out the first tenth
        # of the swing (just off the toe) and the last 15 % (the heel coming down to strike)
        clear = []
        duty_ = GAITS[clip]["duty"]
        for side in "LR":
            u = np.array([((r["f"] / N) + (0 if side == "L" else 0.5)) % 1 for r in rows])
            s_ = (u - duty_) / (1 - duty_)
            sw = (u > duty_) & (s_ > 0.1) & (s_ < 0.85)
            clear.append(float(np.array([r["footmin." + side] if "footmin." + side in r else 9 for r in rows])[sw].min()))
        info["swing_min_clearance_m"] = round(min(clear), 4)
        if min(clear) < 0.01:
            fail(f"{clip}: the swinging foot passes {min(clear) * 100:.1f} cm over the floor")
        # thigh angle from vertical, forward positive, and the highest point of either hand
        flex = [math.degrees(math.atan2(r["UpLeg." + s][1] - r["knee." + s][1], r["UpLeg." + s][2] - r["knee." + s][2]))
                for r in rows for s in "LR"]
        info["peak_hip_flexion_deg"] = round(max(flex), 1)
        info["peak_hand_height_m"] = round(max(r["hand_top"] for r in rows), 3)
        if clip == "Run" and (max(flex) > 56 or info["peak_hand_height_m"] > 1.25):
            fail(f"Run: thigh {max(flex):.0f} deg from vertical, hands up to {info['peak_hand_height_m']:.2f} m (a jog, not a sprint)")
        if clip == "Walk":
            air = [r["f"] for r in rows if min(r["footmin.L"], r["footmin.R"]) > 0.004]
            info["frames_both_feet_off_floor"] = air
            if air:
                fail(f"Walk: both feet off the floor at frames {air}")
            inside = max(r["hands_in_hips"] for r in rows if "hands_in_hips" in r)
            info["hand_vertices_in_hips_max"] = inside
            if inside > 10:
                fail(f"Walk: {inside} hand vertices inside the hips")
    if clip in ("Sit", "SitType"):
        seat = [r["seat"] for r in rows if "seat" in r]
        info["seat_contact_m"] = [round(min(seat), 4), round(max(seat), 4)]
        info["thigh_lowest_over_seat_front_m"] = round(min(r["thigh_under_seat_front"] for r in rows if "seat" in r), 4)
        info["hip_joint_height_m"] = round(float(np.mean([r["UpLeg.L"][2] for r in rows])), 4)
        info["hip_joint_forward_m"] = round(float(-np.mean([r["UpLeg.L"][1] for r in rows])), 4)
        info["hips_bone_head_m"] = round(float(np.mean([r["Hips"][2] for r in rows])), 4)
        if not all(abs(sv - SEAT) <= 0.03 for sv in seat):
            fail(f"{clip}: seat contact {min(seat):.3f}..{max(seat):.3f}")
        fm = [min(r["footmin.L"], r["footmin.R"]) for r in rows if "footmin.L" in r]
        info["lowest_foot_vertex_m"] = [round(min(fm), 4), round(max(fm), 4)]
        if not all(-0.01 <= v_ <= 0.03 for v_ in fm):
            fail(f"{clip}: feet not on the floor {min(fm):.3f}..{max(fm):.3f}")
        knees = []
        for r in rows:
            for side in "LR":
                a_ = r["UpLeg." + side] - r["knee." + side]
                b_ = r["Foot." + side] - r["knee." + side]
                knees.append(math.degrees(math.acos(a_ @ b_ / np.linalg.norm(a_) / np.linalg.norm(b_))))
        info["knee_inner_angle_deg"] = [round(min(knees), 1), round(max(knees), 1)]
        if not all(75 <= k_ <= 105 for k_ in knees):
            fail(f"{clip}: knee angle {min(knees):.1f}..{max(knees):.1f}")
        info["ankle_forward_m"] = round(float(-np.mean([r["Foot.L"][1] for r in rows])), 4)
        info["foot_centre_forward_m"] = round(float(-np.mean([(r["Foot.L"][1] + r["toe.L"][1]) / 2 for r in rows])), 4)
        th = [(r["knee.L"][2] - r["UpLeg.L"][2]) / np.linalg.norm(r["knee.L"] - r["UpLeg.L"]) for r in rows]
        info["thigh_slope_deg"] = round(math.degrees(math.asin(float(np.mean(th)))), 1)
    if clip in ("Sit", "SitType"):
        slab = max(r["desk_slab"] for r in rows if "desk_slab" in r)
        info["vertices_in_desk_top_max"] = slab
        if slab:
            fail(f"{clip}: {slab} vertices inside the desk top")
    if clip == "SitType":
        ev = [r for r in rows if "desk_slab" in r]
        low = min(r["glove_low"] for r in ev)
        info["forearm_hand_vertices_under_desk_top_max"] = max(r["arm_under_desk"] for r in ev)
        info["vertices_in_keyboard_max"] = max(r["in_keyboard"] for r in ev)
        info["lowest_glove_point_m"] = [round(low, 4), round(max(r["glove_low"] for r in ev), 4)]
        info["glove_forward_m"] = [round(min(r["glove_fwd"][0] for r in ev), 3), round(max(r["glove_fwd"][1] for r in ev), 3)]
        info["wrists_across_forward_up_m"] = [[round(float(r_[0]), 3), round(float(-r_[1]), 3), round(float(r_[2]), 3)]
                                              for r_ in (rows[0]["Hand.L"], rows[0]["Hand.R"])]
        info["typing_wrist_target_m"] = [TYPE["across"], TYPE["wrist_fwd"], round(TYPE["wrist_z"], 4)]
        if info["forearm_hand_vertices_under_desk_top_max"]:
            fail("SitType: forearm or glove below the desk top in front of its edge")
        if info["vertices_in_keyboard_max"] or low < KEYS["top"] + 0.004:
            fail(f"SitType: gloves in the keyboard (lowest {low:.3f} m, key tops {KEYS['top']} m)")
    if clip == "Sit":
        info["wrists_m"] = [np.round(rows[0]["Hand.L"], 3).tolist(), np.round(rows[0]["Hand.R"], 3).tolist()]
    if clip == "Point":
        dz = [r["Hand.R"][2] - r["UpperArm.R"][2] for r in rows]
        info["wrist_minus_shoulder_height_m"] = [round(min(dz), 4), round(max(dz), 4)]
        info["wrist_forward_of_shoulder_m"] = round(float(np.mean([r["UpperArm.R"][1] - r["Hand.R"][1] for r in rows])), 4)
        if not all(abs(d_) < 0.08 for d_ in dz):
            fail("Point: wrist not at shoulder height")
        nrm = POSES["Point"][0].Ra["Hand.R"] @ REST_R["Hand.R"] @ PALM_R
        info["palm_normal_up_component"] = round(abs(float(nrm[2])), 3)
        if abs(nrm[2]) > 0.35:
            fail("Point: the open hand is palm down, not edge on")
        pgrow = [edge_growth(skin(POINT_PREVIEW[f])) for f in range(0, len(POINT_PREVIEW), 8)]
        info["edge_growth_max_m"] = round(max(g_[0] for g_ in pgrow), 4)   # layered over Idle
        info["edges_over_5cm_max"] = max(g_[1] for g_ in pgrow)
        fcs = []
        for lay in ACTS["Point"].layers:
            for st in lay.strips:
                for cb in st.channelbags:
                    fcs += [fc.data_path for fc in cb.fcurves]
        bones_keyed = sorted({p.split('"')[1] for p in fcs})
        info["keyed_bones"] = bones_keyed
        if sorted(POINT_BONES) != bones_keyed:
            fail(f"Point keys {bones_keyed}")
    if info.get("edge_growth_max_m", 0) > EDGE_FAIL:
        fail(f"{clip}: a mesh edge stretches {info['edge_growth_max_m'] * 100:.1f} cm")
    report["clips"][clip] = info
    print("measure", clip, json.dumps(info, default=float))

rest_sep = abs(REST_HEAD["Foot.L"][0] - REST_HEAD["Foot.R"][0])
report["rest"] = dict(ankles_across_m=round(float(rest_sep), 4),
                      hip_joints_across_m=round(float(abs(REST_HEAD["UpLeg.L"][0] - REST_HEAD["UpLeg.R"][0])), 4),
                      sculpt_arm_angle_deg=arm_angle)
report["tris"] = len(mesh.data.polygons)
meta = {
    "height": H,
    "walkSpeed": report["clips"]["Walk"]["ground_speed_mps"],
    "runSpeed": report["clips"]["Run"]["ground_speed_mps"],
    "seatHeight": SEAT,
    "keyboardReach": KEYS["forward"],
    "clips": CLIPS,
    "clipSeconds": {c: report["clips"][c]["seconds"] for c in CLIPS},
}
os.makedirs(os.path.dirname(META) or ".", exist_ok=True)
with open(META, "w") as fh:
    json.dump(meta, fh, indent=2)
with open(os.path.splitext(OUT)[0] + "-measure.json", "w") as fh:
    json.dump(report, fh, indent=2, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o))
print("MEASURE", "OK" if report["ok"] else "FAILED", report["fails"])

# ---------------------------------------------------------------- export
use(ACTS["Idle"])
scene.frame_set(0)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True,
                          export_animations=True, export_animation_mode="ACTIONS", export_image_format="WEBP",
                          export_tangents=False, export_morph=False, export_force_sampling=True,
                          export_optimize_animation_keep_anim_armature=True)
print("exported", OUT)

# ---------------------------------------------------------------- contact sheets
# Point is previewed layered over Idle, the way the site plays it
ACTS["PointPreview"] = bake("PointPreview", POINT_PREVIEW)

scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "Standard"
CW, CH = 300, 460
scene.render.resolution_x, scene.render.resolution_y = CW, CH
world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.57, 0.6, 1)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (0.9, 0.2, 0.6)
scene.collection.objects.link(sun)
fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
fill.data.energy = 1.5
fill.rotation_euler = (1.2, 0, 3.6)
scene.collection.objects.link(fill)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.type = "ORTHO"


def helper_box(name, centre, size, colour):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = colour
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = colour
    ob.data.materials.append(mat)
    return ob


floor = helper_box("floor", (0, 0, -0.005), (4, 4, 0.01), (0.75, 0.75, 0.72, 1))
seat = helper_box("seat", (0, 0, SEAT - 0.02), (0.44, 0.44, 0.04), (0.35, 0.45, 0.6, 1))
# the bench desk top and keyboard; the operator's right is -X here, and the desk centre is
# 0.2 m that way from the seat centre
desk = helper_box("desk", (-0.20, -(DESK["front"] + 0.35), DESK["top"] - DESK["thick"] / 2), (1.40, 0.70, DESK["thick"]), (0.35, 0.55, 0.4, 1))
kb = helper_box("keyboard", (0, -KEYS["forward"], (DESK["top"] + KEYS["top"]) / 2),
                (KEYS["width"], KEYS["depth"], KEYS["top"] - DESK["top"]), (0.6, 0.3, 0.2, 1))
SEATED = [seat, desk, kb]

os.makedirs(RENDER_DIR + "/cells", exist_ok=True)


def sheet(clip, act, N, cols=6):
    use(act)
    seated = clip.startswith("Sit")
    for ob in SEATED:
        ob.hide_render = not seated
    desk.hide_render = kb.hide_render = not seated
    centre = Vector((0, -0.15, 0.72)) if seated else Vector((0, 0, 0.92))
    cam.data.ortho_scale = 1.75 if seated else 2.05
    cells = []
    for view in ("front", "side"):
        for c in range(cols):
            f = round(c * N / cols)
            scene.frame_set(f)
            d = Vector((0, -1, 0)) if view == "front" else Vector((-1, 0, 0))
            cam.location = centre + d * 6
            cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
            path = f"{RENDER_DIR}/cells/{clip.lower()}-{view}-{f:03d}.png"
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            cells.append(path)
    grid = np.zeros((CH * 2, CW * cols, 4), np.float32)
    for i, path in enumerate(cells):
        img = bpy.data.images.load(path)
        px = np.empty(CW * CH * 4, np.float32)
        img.pixels.foreach_get(px)
        row = 1 - i // cols    # front row on top; image rows run bottom-up
        grid[row * CH:(row + 1) * CH, (i % cols) * CW:(i % cols + 1) * CW] = px.reshape(CH, CW, 4)
        bpy.data.images.remove(img)
    out = bpy.data.images.new("sheet-" + clip, CW * cols, CH * 2, alpha=False)
    out.pixels.foreach_set(grid.ravel())
    out.filepath_raw = f"{RENDER_DIR}/sheet-{clip.lower()}.png"
    out.file_format = "PNG"
    out.save()
    print("sheet", out.filepath_raw)


only = os.environ.get("SHEETS")
for clip in CLIPS:
    if only and clip not in only.split(","):
        continue
    sheet(clip, ACTS["PointPreview"] if clip == "Point" else ACTS[clip], len(POSES[clip]))
