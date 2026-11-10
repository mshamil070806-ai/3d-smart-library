import bpy
import os
import mathutils

def run():
    blend_path = r"c:\Users\THARQIYA\Documents\tt\library_shelves_updated.blend"
    glb_input_path = r"C:\Users\THARQIYA\.gemini\antigravity\brain\8af73248-0906-4174-bef5-b0745d545d13\.user_uploaded\media_1794192233672_b31d48da.glb"
    glb_export_path = r"c:\Users\THARQIYA\Documents\tt\library.glb"

    print("=== STARTING HALF SHELF REPLACEMENT ===")
    bpy.ops.wm.open_mainfile(filepath=blend_path)

    # 1. Locate the half shelf parent empty
    half_shelf_empty = bpy.data.objects.get("Right_Row3_Shelf2_HALF_SHELF_1Bay_5Rows")
    if not half_shelf_empty:
        raise ValueError("Could not find 'Right_Row3_Shelf2_HALF_SHELF_1Bay_5Rows' in the scene!")

    print(f"Found target half shelf empty at: {half_shelf_empty.location}")

    # 2. Delete existing child models of this half shelf
    for child in list(half_shelf_empty.children):
        print(f"Removing old child object: {child.name}")
        old_mesh_data = child.data if child.type == 'MESH' else None
        bpy.data.objects.remove(child, do_unlink=True)
        if old_mesh_data and old_mesh_data.users == 0:
            bpy.data.meshes.remove(old_mesh_data)

    # Also remove any old unused master small shelf
    for name in ["Master_Small_Shelf", "Master_Small_Shelf_New", "Master_Small_Shelf_Data"]:
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
        if name in bpy.data.meshes:
            bpy.data.meshes.remove(bpy.data.meshes[name])

    # 3. Import the new uploaded GLB
    print(f"Importing new GLB: {glb_input_path}...")
    bpy.ops.import_scene.gltf(filepath=glb_input_path)
    imported_objs = list(bpy.context.selected_objects)
    print(f"Imported {len(imported_objs)} objects from new GLB.")

    # Collect names of non-mesh objects to delete later
    non_mesh_names = [o.name for o in imported_objs if o.type != 'MESH']

    # Find the root of the imported shelf
    imported_root = bpy.data.objects.get("Half_Bookshelf_1Bay_5Rows")
    if not imported_root:
        roots = [o for o in imported_objs if o.parent is None or o.parent not in imported_objs]
        imported_root = roots[0]

    print(f"Imported root is: {imported_root.name}")
    imported_root.location = (0, 0, 0)
    imported_root.rotation_euler = (0, 0, 0)
    imported_root.scale = (1, 1, 1)
    bpy.context.view_layer.update()

    # Collect all mesh objects from imported hierarchy
    imported_meshes = [o for o in imported_objs if o.type == 'MESH']
    print(f"Found {len(imported_meshes)} mesh pieces to join.")

    bpy.ops.object.select_all(action='DESELECT')
    for m in imported_meshes:
        m.select_set(True)

    bpy.context.view_layer.objects.active = imported_meshes[0]
    bpy.ops.object.join()

    joined_shelf = bpy.context.view_layer.objects.active
    joined_shelf.name = "Master_Small_Shelf_New"
    joined_shelf.data.name = "Master_Small_Shelf_New_Data"

    # Set origin to cursor at (0, 0, 0)
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

    # Unlink from imported root
    joined_shelf.parent = None
    joined_shelf.location = (0, 0, 0)
    joined_shelf.rotation_euler = (0, 0, 0)
    joined_shelf.scale = (1, 1, 1)
    bpy.context.view_layer.update()

    # Clean up empty imported root & any leftover non-mesh objects
    for name in non_mesh_names:
        if name in bpy.data.objects and bpy.data.objects[name] != joined_shelf:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    print("Joined new model dimensions:", joined_shelf.dimensions)
    print("Joined new model bounding box min/max:")
    print("Min:", [min(v[i] for v in joined_shelf.bound_box) for i in range(3)])
    print("Max:", [max(v[i] for v in joined_shelf.bound_box) for i in range(3)])
    print("Materials:", [m.name for m in joined_shelf.data.materials])

    # 4. Create new instance under Right_Row3_Shelf2_HALF_SHELF_1Bay_5Rows
    col = bpy.data.collections.get("Collection") or bpy.data.collections[0]
    new_shelf_model = bpy.data.objects.new("Right_Row3_Shelf2_HALF_SHELF_1Bay_5Rows_Model", joined_shelf.data)
    new_shelf_model.location = (0, 0, 0)
    new_shelf_model.rotation_euler = (0, 0, 0)
    new_shelf_model.scale = (1, 1, 1)
    new_shelf_model.parent = half_shelf_empty
    col.objects.link(new_shelf_model)

    # Remove the master template wrapper object
    bpy.data.objects.remove(joined_shelf, do_unlink=True)

    # 5. Purge unused orphan data
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    # 6. Save updated blend file
    print(f"Saving updated blend file to: {blend_path}...")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("Blend file saved successfully.")

    # 7. Export to GLB
    print(f"Exporting optimized GLB to: {glb_export_path}...")
    bpy.ops.export_scene.gltf(
        filepath=glb_export_path,
        export_format='GLB',
        export_extras=True,
        export_yup=True
    )
    print("GLB export completed successfully!")

if __name__ == "__main__":
    run()
