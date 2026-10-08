import os
import sys
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, HTTPServer

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean_path = super().translate_path(path)
        base_dir = getattr(self, 'directory', None) or os.getcwd()
        try:
            rel_path = os.path.relpath(clean_path, base_dir)
        except Exception:
            return ""
        parts = rel_path.split(os.sep)
        for p in parts:
            # Skip current and parent path indicators
            if p in ('.', '..', ''):
                continue
            # Block hidden directories/files (.git, .env) and sensitive credentials (.pem, .key)
            if p.startswith('.') or p.endswith('.pem') or p.endswith('.key'):
                return ""  # Invalid path to block access
        return clean_path

    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled")
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def create_server(start_port=8000, max_attempts=20, directory=None):
    base_dir = directory or os.getcwd()
    handler = partial(CustomHTTPRequestHandler, directory=base_dir)
    for p in range(start_port, start_port + max_attempts):
        try:
            httpd = HTTPServer(('127.0.0.1', p), handler)
            return httpd, p
        except OSError:
            continue
    httpd = HTTPServer(('127.0.0.1', start_port), handler)
    return httpd, start_port

def run_server(port=8000, directory=None, on_bound=None):
    if directory:
        os.chdir(directory)
    base_dir = directory or os.getcwd()
    httpd, active_port = create_server(start_port=port, directory=base_dir)
    print(f"\n===================================================")
    print(f"  Guitar Scale Tuner Server: http://localhost:{active_port}")
    print(f"===================================================\n")
    if on_bound:
        try:
            on_bound(active_port)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Stopping Web Server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
