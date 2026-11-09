# Shared "painted" look for every Strike Zone asset.
# Bakes ambient occlusion into a vertex color layer, then layers a top-light gradient,
# edge highlights and soft grime noise on top. Materials multiply base color by it, and the
# glTF exporter writes it as COLOR_0 (Three.js multiplies it automatically).
import bpy, math, random
from mathutils import Vector, noise


def _hook_materials(ob, layer):
    for m in ob.data.materials:
        if not m or not m.use_nodes: continue
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        if not bsdf or any(n.type == 'VERTEX_COLOR' for n in nt.nodes): continue
        col = nt.nodes.new('ShaderNodeVertexColor'); col.layer_name = layer
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        base = bsdf.inputs['Base Color'].default_value[:]
        mix.inputs[6].default_value = base
        nt.links.new(col.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


def paint(ob, ao_samples=24, ao_dist=0.25, grad=0.22, grime=0.10, edge=0.10, seed=1):
    """Bake AO into a vertex color layer and add gradient, edge light and grime. Returns layer name."""
    random.seed(seed)
    me = ob.data
    layer = 'Paint'
    if layer not in me.color_attributes:
        me.color_attributes.new(layer, 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = me.color_attributes[layer]
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = ao_samples
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.light_settings.distance = ao_dist
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    try:
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    except Exception as e:          # fall back to plain white if baking isn't possible
        print('AO bake failed, using white:', e)
        for d in me.color_attributes[layer].data: d.color = (1, 1, 1, 1)
    zs = [v.co.z for v in me.vertices]
    z0, z1 = min(zs), max(zs); span = max(z1 - z0, 1e-4)
    data = me.color_attributes[layer].data
    for poly in me.polygons:
        n = poly.normal
        up = max(0.0, n.z)                      # faces pointing up catch more light
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            ao = data[li].color[0]
            ao = 0.45 + 0.55 * ao               # keep crevices dark but never black
            g = 1.0 - grad + grad * ((v.z - z0) / span)
            e = 1.0 + edge * up
            nz = noise.noise(Vector((v.x * 9.0 + seed, v.y * 9.0, v.z * 9.0)))
            gr = 1.0 - grime * max(0.0, nz) * (1.0 - (v.z - z0) / span * 0.6)   # grime settles low
            k = max(0.0, min(1.25, ao * g * e * gr))
            data[li].color = (k, k, k, 1.0)
    _hook_materials(ob, layer)
    return layer
