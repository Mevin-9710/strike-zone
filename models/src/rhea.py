# Rhea Voss: stylized low-poly field agent, T-pose. Run: blender -b -P rhea.py -- <outdir>
import bpy, sys, math
out = sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(n,c,e=0):
    m=bpy.data.materials.new(n); m.use_nodes=True; b=m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value=(*c,1); b.inputs['Roughness'].default_value=0.7
    if e: b.inputs['Emission Color'].default_value=(*c,1); b.inputs['Emission Strength'].default_value=e
    return m
SKIN=mat('skin',(0.62,0.42,0.30)); JACK=mat('jacket',(0.07,0.09,0.13)); PANT=mat('pants',(0.12,0.13,0.16))
BLUE=mat('blue',(0.10,0.45,1.0),2.0); HAIR=mat('hair',(0.03,0.025,0.02)); BOOT=mat('boot',(0.04,0.04,0.05)); VISOR=mat('visor',(0.2,0.7,1.0),3.0)
parts=[]
def box(n,loc,size,m,bev=0.02):
    bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=n; o.scale=[s/2 for s in size]
    bpy.ops.object.transform_apply(scale=True)
    if bev: md=o.modifiers.new('b','BEVEL'); md.width=bev; md.segments=1
    o.data.materials.append(m); parts.append(o); return o
def cyl(n,loc,r,d,m,rot=(0,0,0),v=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v,radius=r,depth=d,location=loc,rotation=rot); o=bpy.context.object; o.name=n
    o.data.materials.append(m); parts.append(o); return o
# legs
for s in (-1,1):
    box(f'thigh{s}',(0.11*s,0,0.72),(0.15,0.17,0.40),PANT)
    box(f'shin{s}',(0.11*s,0,0.33),(0.13,0.15,0.40),PANT)
    box(f'boot{s}',(0.11*s,-0.03,0.07),(0.14,0.24,0.14),BOOT)
    box(f'kneepad{s}',(0.11*s,-0.09,0.52),(0.11,0.03,0.10),BLUE,0.01)
# torso
box('hips',(0,0,0.95),(0.34,0.20,0.14),PANT)
box('belt',(0,0,1.03),(0.36,0.21,0.05),BOOT,0.005)
box('torso',(0,0,1.25),(0.38,0.22,0.40),JACK)
box('chest',(0,-0.02,1.36),(0.40,0.24,0.18),JACK)
box('stripeL',(-0.12,-0.135,1.30),(0.03,0.01,0.34),BLUE,0)
box('stripeR',(0.12,-0.135,1.30),(0.03,0.01,0.34),BLUE,0)
box('collar',(0,0,1.50),(0.20,0.18,0.06),JACK)
# arms T-pose
for s in (-1,1):
    box(f'shoulder{s}',(0.25*s,0,1.42),(0.14,0.18,0.14),JACK)
    box(f'upper{s}',(0.42*s,0,1.42),(0.26,0.12,0.12),JACK)
    box(f'band{s}',(0.50*s,0,1.42),(0.03,0.125,0.125),BLUE,0)
    box(f'fore{s}',(0.67*s,0,1.42),(0.26,0.10,0.10),JACK)
    box(f'glove{s}',(0.85*s,0,1.42),(0.10,0.09,0.08),BOOT)
# head
box('neck',(0,0,1.56),(0.09,0.09,0.06),SKIN,0)
box('head',(0,0,1.68),(0.19,0.21,0.22),SKIN,0.03)
box('hairtop',(0,0.01,1.80),(0.21,0.23,0.06),HAIR,0.02)
box('hairback',(0,0.08,1.70),(0.21,0.08,0.18),HAIR,0.02)
for s in (-1,1): box(f'hairside{s}',(0.10*s,0.02,1.72),(0.03,0.17,0.12),HAIR,0.01)
box('visor',(0,-0.04,1.80),(0.22,0.14,0.035),VISOR,0.01)
for s in (-1,1): box(f'eye{s}',(0.045*s,-0.106,1.69),(0.03,0.005,0.015),HAIR,0)
# join + export
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
for o in parts:
    bpy.context.view_layer.objects.active=o
    for m in o.modifiers: bpy.ops.object.modifier_apply(modifier=m.name)
for o in parts: o.select_set(True)
bpy.ops.object.join(); rhea=bpy.context.object; rhea.name='Rhea'
tris=sum(len(p.vertices)-2 for p in rhea.data.polygons)
bpy.ops.export_scene.gltf(filepath=f'{out}/rhea.glb',export_format='GLB',use_selection=True)
# render front + side
sc=bpy.context.scene; sc.render.engine='BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
sc.render.resolution_x=640; sc.render.resolution_y=800
w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.16,0.18,0.22,1); sc.world=w
bpy.ops.object.light_add(type='SUN',location=(2,-3,4),rotation=(math.radians(50),0,math.radians(30))); bpy.context.object.data.energy=4
bpy.ops.object.light_add(type='AREA',location=(-2,2,2)); bpy.context.object.data.energy=150
bpy.ops.mesh.primitive_plane_add(size=6); bpy.context.object.data.materials.append(mat('floor',(0.25,0.27,0.3)))
bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=2.2
for name,loc,rot in [('front',(0,-5,0.95),(math.radians(90),0,0)),('side',(5,0,0.95),(math.radians(90),0,math.radians(90))),('three',(3.5,-3.5,1.6),(math.radians(80),0,math.radians(45)))]:
    cam.location=loc; cam.rotation_euler=rot; sc.render.filepath=f'{out}/rhea_{name}.png'; bpy.ops.render.render(write_still=True)
print('TRIS',tris)
