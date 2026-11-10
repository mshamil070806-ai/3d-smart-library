import http.server
import socketserver
import json
import os
import urllib.parse

PORT = 5050
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
BOOKS_FILE = os.path.join(DIRECTORY, "books.json")
LAYOUT_FILE = os.path.join(DIRECTORY, "library_layout.json")

class LibraryHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".glb"):
            return "model/gltf-binary"
        if path.endswith(".gltf"):
            return "model/gltf+json"
        if path.endswith(".json"):
            return "application/json; charset=utf-8"
        if path.endswith(".js"):
            return "application/javascript; charset=utf-8"
        if path.endswith(".css"):
            return "text/css; charset=utf-8"
        return super().guess_type(path)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/books":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            if os.path.exists(BOOKS_FILE):
                with open(BOOKS_FILE, "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
            else:
                self.wfile.write(b"[]")
            return

        if parsed.path == "/api/categories":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            if os.path.exists(LAYOUT_FILE):
                with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.wfile.write(json.dumps(data.get("categories", []), ensure_ascii=False).encode("utf-8"))
            else:
                self.wfile.write(b"[]")
            return

        if parsed.path == "/api/layout":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            if os.path.exists(LAYOUT_FILE):
                with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
            else:
                self.wfile.write(b"{}")
            return
        
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/books":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                new_book = json.loads(body)
                books = []
                if os.path.exists(BOOKS_FILE):
                    with open(BOOKS_FILE, "r", encoding="utf-8") as f:
                        books = json.load(f)
                
                # Check for duplicate ID or barcode
                if not new_book.get("id"):
                    new_book["id"] = f"BK-{len(books) + 1:03d}"
                
                books.append(new_book)
                with open(BOOKS_FILE, "w", encoding="utf-8") as f:
                    json.dump(books, f, indent=2, ensure_ascii=False)
                
                self.send_response(201)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps(new_book, ensure_ascii=False).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if parsed.path == "/api/categories":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                new_cat = json.loads(body)
                if not new_cat.get("id"):
                    # Slugify name or generate ID
                    new_cat["id"] = new_cat.get("name", "cat").lower().replace(" ", "_")[:20]
                
                if os.path.exists(LAYOUT_FILE):
                    with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    categories = data.get("categories", [])
                    # Check if already exists; if so, update
                    idx = next((i for i, c in enumerate(categories) if c["id"] == new_cat["id"]), None)
                    if idx is not None:
                        categories[idx] = new_cat
                    else:
                        categories.append(new_cat)
                    data["categories"] = categories

                    # If rows/shelves were assigned in new_cat, update those shelves
                    assigned_side = new_cat.get("side", "left")
                    assigned_rows = new_cat.get("rows", [])
                    for s in data.get("shelves", []):
                        if s.get("side") == assigned_side and s.get("row") in assigned_rows:
                            s["category"] = new_cat["id"]

                    with open(LAYOUT_FILE, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    
                    self.send_response(201)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps(new_cat, ensure_ascii=False).encode("utf-8"))
                else:
                    self.send_response(500)
                    self.end_headers()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if parsed.path == "/api/shelves/category":
            # Assign category to shelf or row
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(body)
                cat_id = payload.get("categoryId")
                shelf_name = payload.get("shelfName")
                side = payload.get("side")
                row = payload.get("row")

                if os.path.exists(LAYOUT_FILE):
                    with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    # Update matching shelves
                    for s in data.get("shelves", []):
                        match = False
                        if shelf_name and s.get("name") == shelf_name:
                            match = True
                        elif side and row is not None and s.get("side") == side and s.get("row") == int(row):
                            match = True
                        
                        if match:
                            s["category"] = cat_id

                    # Also update category row lists to stay in sync
                    if side and row is not None:
                        row_int = int(row)
                        for cat in data.get("categories", []):
                            if cat.get("side") == side:
                                if cat.get("id") == cat_id:
                                    if "rows" not in cat: cat["rows"] = []
                                    if row_int not in cat["rows"]:
                                        cat["rows"].append(row_int)
                                        cat["rows"].sort()
                                else:
                                    # Remove row from old category
                                    if "rows" in cat and row_int in cat["rows"]:
                                        cat["rows"].remove(row_int)

                    with open(LAYOUT_FILE, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2, ensure_ascii=False)
                    
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "message": "Shelf category updated"}).encode("utf-8"))
                else:
                    self.send_response(500)
                    self.end_headers()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/books/"):
            book_id = parsed.path.split("/")[-1]
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                updated_data = json.loads(body)
                books = []
                if os.path.exists(BOOKS_FILE):
                    with open(BOOKS_FILE, "r", encoding="utf-8") as f:
                        books = json.load(f)
                
                updated_book = None
                for i, b in enumerate(books):
                    if b.get("id") == book_id or b.get("barcode") == book_id:
                        books[i].update(updated_data)
                        updated_book = books[i]
                        break
                
                if updated_book:
                    with open(BOOKS_FILE, "w", encoding="utf-8") as f:
                        json.dump(books, f, indent=2, ensure_ascii=False)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps(updated_book, ensure_ascii=False).encode("utf-8"))
                else:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Book not found"}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if parsed.path.startswith("/api/categories/"):
            cat_id = parsed.path.split("/")[-1]
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                updated_cat = json.loads(body)
                if os.path.exists(LAYOUT_FILE):
                    with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    
                    found = False
                    for i, c in enumerate(data.get("categories", [])):
                        if c["id"] == cat_id:
                            data["categories"][i].update(updated_cat)
                            found = True
                            break
                    
                    if found:
                        with open(LAYOUT_FILE, "w", encoding="utf-8") as f:
                            json.dump(data, f, indent=2, ensure_ascii=False)
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.end_headers()
                        self.wfile.write(json.dumps(data["categories"][i], ensure_ascii=False).encode("utf-8"))
                    else:
                        self.send_response(404)
                        self.end_headers()
                else:
                    self.send_response(500)
                    self.end_headers()
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/books/"):
            book_id = parsed.path.split("/")[-1]
            if os.path.exists(BOOKS_FILE):
                with open(BOOKS_FILE, "r", encoding="utf-8") as f:
                    books = json.load(f)
                books = [b for b in books if b.get("id") != book_id and b.get("barcode") != book_id]
                with open(BOOKS_FILE, "w", encoding="utf-8") as f:
                    json.dump(books, f, indent=2, ensure_ascii=False)
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return

        if parsed.path.startswith("/api/categories/"):
            cat_id = parsed.path.split("/")[-1]
            if os.path.exists(LAYOUT_FILE):
                with open(LAYOUT_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["categories"] = [c for c in data.get("categories", []) if c.get("id") != cat_id]
                # Reset shelves that had this category to novels
                for s in data.get("shelves", []):
                    if s.get("category") == cat_id:
                        s["category"] = "novels"
                with open(LAYOUT_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
            
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/books/"):
            book_id = parsed.path.split("/")[-1]
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                updated_data = json.loads(body)
                books = []
                if os.path.exists(BOOKS_FILE):
                    with open(BOOKS_FILE, "r", encoding="utf-8") as f:
                        books = json.load(f)
                
                updated_book = None
                for i, b in enumerate(books):
                    if b.get("id") == book_id or b.get("barcode") == book_id:
                        books[i].update(updated_data)
                        updated_book = books[i]
                        break
                
                if updated_book:
                    with open(BOOKS_FILE, "w", encoding="utf-8") as f:
                        json.dump(books, f, indent=2, ensure_ascii=False)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps(updated_book, ensure_ascii=False).encode("utf-8"))
                else:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Book not found"}).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), LibraryHTTPRequestHandler) as httpd:
        print(f"==================================================")
        print(f"  3D Smart Library Server running on port {PORT}")
        print(f"  Open in browser: http://localhost:{PORT}")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
