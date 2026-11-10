import bpy
import mathutils

def delete_hierarchy(obj):
    """Recursively deletes an object and all its children."""
    for child in list(obj.children):
        delete_hierarchy(child)
    bpy.data.objects.remove(obj, do_unlink=True)

def prepare_template_mesh(template_empty, name):
    """
    Moves template to (0,0,0), gathers all child meshes in local space,
    joins them into a single clean master mesh with its materials,
    and returns that single mesh object.
    """
    # Move parent to origin so coordinates are relative to origin
    template_empty.location = (0, 0, 0)
    template_empty.rotation_euler = (0, 0, 0)
    template_empty.scale = (1, 1, 1)
    bpy.context.view_layer.update()

    meshes = []
    def gather(o):
        for c in o.children:
            if c.type == 'MESH':
                meshes.append(c)
            gather(c)
    gather(template_empty)

    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name + "_Data"
    
    # Detach from template parent
    joined.parent = None
    joined.location = (0, 0, 0)
    joined.rotation_euler = (0, 0, 0)
    joined.scale = (1, 1, 1)
    
    return joined

def run():
    print("=== STARTING PERFECT SHELF REPLACEMENT ===")
    col = bpy.data.collections.get("Collection") or bpy.data.collections[0]

    # 1. Grab reference templates
    t_big = bpy.data.objects.get('Library_Bookshelf_Unit.001') or bpy.data.objects.get('Library_Bookshelf_Unit')
    t_small = bpy.data.objects.get('Half_Bookshelf_1Bay_5Rows.002') or bpy.data.objects.get('Half_Bookshelf_1Bay_5Rows')

    if not t_big or not t_small:
        raise ValueError("Could not find big or small template shelves!")

    print(f"Preparing Master Big Shelf from: {t_big.name}")
    master_big = prepare_template_mesh(t_big, "Master_Big_Shelf")

    print(f"Preparing Master Small Shelf from: {t_small.name}")
    master_small = prepare_template_mesh(t_small, "Master_Small_Shelf")

    # 2. Delete duplicate room layout if present
    dup_room = bpy.data.objects.get('Library_Room_Layout.001')
    if dup_room:
        print("Deleting duplicate Library_Room_Layout.001...")
        delete_hierarchy(dup_room)

    # 3. Delete overlapping / merged shelves sitting in the center of the room at (0,0,0)
    center_names = ['Library_Bookshelf_Unit', 'Half_Bookshelf_1Bay_5Rows', 'Half_Bookshelf_1Bay_5Rows.001']
    for c_name in center_names:
        c_obj = bpy.data.objects.get(c_name)
        if c_obj and c_obj != master_big and c_obj != master_small:
            print(f"Deleting center shelf at (0,0,0): {c_name}")
            delete_hierarchy(c_obj)

    # Also delete original template empties (their meshes are now joined into master_big / master_small)
    if t_big and t_big != master_big and t_big.name in bpy.data.objects:
        delete_hierarchy(t_big)
    if t_small and t_small != master_small and t_small.name in bpy.data.objects:
        delete_hierarchy(t_small)

    # 4. Find all shelves in All_Room_Bookshelves
    room_shelves_group = bpy.data.objects.get('All_Room_Bookshelves')
    if not room_shelves_group:
        raise ValueError("All_Room_Bookshelves not found!")

    active_shelves = list(room_shelves_group.children)
    print(f"Replacing meshes for {len(active_shelves)} active room shelves...")

    big_count = 0
    small_count = 0

    for shelf in active_shelves:
        is_half = 'half' in shelf.name.lower()
        
        # Remove old placeholder child meshes
        for old_child in list(shelf.children):
            delete_hierarchy(old_child)

        # Create linked instance of master mesh
        if is_half:
            mesh_data = master_small.data
            small_count += 1
        else:
            mesh_data = master_big.data
            big_count += 1

        inst = bpy.data.objects.new(shelf.name + "_Model", mesh_data)
        inst.location = (0, 0, 0)
        inst.rotation_euler = (0, 0, 0)
        inst.scale = (1, 1, 1)
        inst.parent = shelf
        col.objects.link(inst)

    print(f"Replaced {big_count} full shelves with Big Shelf model.")
    print(f"Replaced {small_count} half shelves with Small Shelf model.")

    # Remove master template wrapper objects (mesh data is preserved on instances)
    bpy.data.objects.remove(master_big, do_unlink=True)
    bpy.data.objects.remove(master_small, do_unlink=True)

    # 5. Purge orphan blocks
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    # 6. Save updated blend file
    save_path = "c:/Users/THARQIYA/Documents/tt/library_shelves_updated.blend"
    bpy.ops.wm.save_as_mainfile(filepath=save_path)
    print(f"Saved updated blend file: {save_path}")

    # 7. Export to GLB
    glb_path = "c:/Users/THARQIYA/Documents/tt/library.glb"
    print(f"Exporting optimized GLB to: {glb_path}...")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_extras=True,
        export_yup=True
    )
    print("glTF export successfully completed!")

if __name__ == '__main__':
    run()
