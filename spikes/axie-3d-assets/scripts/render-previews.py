"""Render one public preview PNG for every animated character GLB.

Run from the repository root:
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
    --python scripts/render-previews.py
"""

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / "assets" / "catalog.json").read_text(encoding="utf-8"))
OUTPUT = ROOT / "previews"
OUTPUT.mkdir(exist_ok=True)


def look_at(obj, point):
    direction = Vector(point) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def material(name, color, roughness=0.72):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    return value


def bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.name == "PreviewFloor":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("Imported GLB has no visible mesh bounds")
    minimum = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    maximum = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    return minimum, maximum


def render(entry):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "assets" / entry["path"]))
    bpy.context.scene.frame_set(1)

    minimum, maximum = bounds()
    center = (minimum + maximum) * 0.5
    size = maximum - minimum
    extent = max(size.x, size.y, size.z, 0.5)

    bpy.ops.mesh.primitive_plane_add(size=extent * 5.0, location=(center.x, center.y, minimum.z - extent * 0.012))
    floor = bpy.context.object
    floor.name = "PreviewFloor"
    floor.data.materials.append(material("PreviewFloorMaterial", (0.027, 0.059, 0.105)))

    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.039, 0.07, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.65
    bpy.context.scene.world = world

    bpy.ops.object.light_add(type="AREA", location=(center.x + extent * 2.0, center.y - extent * 2.4, center.z + extent * 2.6))
    key = bpy.context.object
    key.data.energy = 950
    key.data.shape = "DISK"
    key.data.size = extent * 2.2
    look_at(key, center)

    bpy.ops.object.light_add(type="AREA", location=(center.x - extent * 2.2, center.y + extent * 1.2, center.z + extent * 1.7))
    rim = bpy.context.object
    rim.data.energy = 720
    rim.data.color = (0.25, 0.75, 1.0)
    rim.data.size = extent * 1.8
    look_at(rim, center)

    bpy.ops.object.camera_add(location=(center.x + extent * 0.72, center.y - extent * 2.35, center.z + extent * 0.48))
    camera = bpy.context.object
    camera.data.lens = 62
    look_at(camera, center + Vector((0, 0, size.z * 0.03)))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(OUTPUT / f"{entry['id']}.png")
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.camera.data.dof.use_dof = False
    bpy.ops.render.render(write_still=True)


for model in CATALOG["models"]:
    if model["family"] == "equipment":
        continue
    print(f"Rendering {model['id']}")
    render(model)

print(f"Rendered {len([m for m in CATALOG['models'] if m['family'] != 'equipment'])} previews to {OUTPUT}")
