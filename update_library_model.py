import bpy
import mathutils

def delete_hierarchy(obj):
    """Recursively deletes an object and all its children."""
    for child in list(obj.children):
        delete_hierarchy(child)
    bpy.data.objects.remove(obj, do_unlink=True)

def clone_tree(src, parent, col):
    """Recursively clones an object tree sharing mesh data blocks."""
    new_obj = bpy.data.objects.new(src.name.split('.')[0], src.data)
    new_obj.location = src.location
    new_obj.rotation_euler = src.rotation_euler
    new_obj.rotation_quaternion = src.rotation_quaternion
    new_obj.rotation_mode = src.rotation_mode
    new_obj.scale = src.scale
    new_obj.parent = parent
    
    col.objects.link(new_obj)
    for c in src.children:
        clone_tree(c, new_obj, col)
    return new_obj

def run():
    print("=== STARTING SHELF MODEL REPLACEMENT ===")
    col = bpy.data.collections.get("Collection") or bpy.data.collections[0]

    # 1. Grab reference templates before removing anything
    t_big = bpy.data.objects.get('Library_Bookshelf_Unit.001') or bpy.data.objects.get('Library_Bookshelf_Unit')
    t_small = bpy.data.objects.get('Half_Bookshelf_1Bay_5Rows.002') or bpy.data.objects.get('Half_Bookshelf_1Bay_5Rows')

    if not t_big or not t_small:
        raise ValueError("Could not find big or small template shelves!")

    print(f"Template Big: {t_big.name} with {len(t_big.children)} direct children")
    print(f"Template Small: {t_small.name} with {len(t_small.children)} direct children")

    # 2. Delete duplicate room layout if present
    dup_room = bpy.data.objects.get('Library_Room_Layout.001')
    if dup_room:
        print("Removing duplicate Library_Room_Layout.001...")
        delete_hierarchy(dup_room)

    # 3. Delete overlapping / merged shelves sitting in the center of the room at (0,0,0)
    center_names = ['Library_Bookshelf_Unit', 'Half_Bookshelf_1Bay_5Rows', 'Half_Bookshelf_1Bay_5Rows.001']
    for c_name in center_names:
        c_obj = bpy.data.objects.get(c_name)
        if c_obj and c_obj != t_big and c_obj != t_small:
            print(f"Removing center shelf at (0,0,0): {c_name}")
            delete_hierarchy(c_obj)

    # 4. Find all shelves in All_Room_Bookshelves
    room_shelves_group = bpy.data.objects.get('All_Room_Bookshelves')
    if not room_shelves_group:
        raise ValueError("All_Room_Bookshelves not found!")

    active_shelves = list(room_shelves_group.children)
    print(f"Found {len(active_shelves)} active shelves in All_Room_Bookshelves")

    replaced_big_count = 0
    replaced_small_count = 0

    for shelf in active_shelves:
        is_half = 'half' in shelf.name.lower()
        
        # Remove old placeholder child meshes
        for old_child in list(shelf.children):
            delete_hierarchy(old_child)

        # Clone from corresponding template
        if is_half:
            print(f"Replacing half shelf: {shelf.name}")
            for c in t_small.children:
                clone_tree(c, shelf, col)
            replaced_small_count += 1
        else:
            for c in t_big.children:
                clone_tree(c, shelf, col)
            replaced_big_count += 1

    print(f"Replaced {replaced_big_count} full shelves with Big Shelf model")
    print(f"Replaced {replaced_small_count} half shelves with Small Shelf model")

    # 5. Remove the isolated template empties outside the room
    print("Cleaning up isolated template models outside room...")
    if t_big and t_big.name in bpy.data.objects:
        delete_hierarchy(t_big)
    if t_small and t_small.name in bpy.data.objects:
        delete_hierarchy(t_small)

    # 6. Purge orphan blocks
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    # 7. Save updated blend file
    save_path = "c:/Users/THARQIYA/Documents/tt/library_shelves_updated.blend"
    bpy.ops.wm.save_as_mainfile(filepath=save_path)
    print(f"Saved updated blend file to: {save_path}")

    # 8. Export to GLB
    glb_path = "c:/Users/THARQIYA/Documents/tt/library.glb"
    print(f"Exporting GLB to: {glb_path}...")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_extras=True,
        export_yup=True
    )
    print("glTF export complete!")

if __name__ == '__main__':
    run()
