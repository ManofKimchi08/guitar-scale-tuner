import os
import sys
import socket
from http.server import SimpleHTTPRequestHandler, HTTPServer

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def find_available_port(start_port=8000, max_attempts=20):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    return start_port

def run_server(port=8000):
    active_port = find_available_port(port)
    server_address = ('0.0.0.0', active_port)
    httpd = HTTPServer(server_address, CustomHTTPRequestHandler)
    print(f"\n===================================================")
    print(f"  Guitar Scale Tuner Server: http://localhost:{active_port}")
    print(f"===================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Stopping Web Server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
