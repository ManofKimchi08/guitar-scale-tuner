import os
import sys
from http.server import SimpleHTTPRequestHandler, HTTPServer

class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS and Cache Control headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def run_server(port=8000):
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, CustomHTTPRequestHandler)
    print(f"\n===================================================")
    print(f"  Guitar Scale Tuner Local Server: http://localhost:{port}")
    print(f"===================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Stopping Web Server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
