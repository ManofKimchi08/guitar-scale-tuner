import os
import sys
import time
import threading
import webbrowser
import asyncio

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

base_dir = get_base_dir()

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

from run_https_server import run_server
from asio_server import audio_broadcaster

def main():
    bound_event = threading.Event()
    active_port = [8000]

    def on_bound(port):
        active_port[0] = port
        bound_event.set()

    # 1. Run HTTP Web Server in background daemon thread
    web_thread = threading.Thread(
        target=run_server,
        kwargs={"port": 8000, "directory": base_dir, "on_bound": on_bound},
        daemon=True
    )
    web_thread.start()

    # 2. Wait until web server binds to port, then open browser
    if bound_event.wait(timeout=3.0):
        try:
            webbrowser.open(f"http://localhost:{active_port[0]}")
        except Exception:
            pass

    # 3. Run ASIO WebSocket Audio Engine with auto-restart resilience
    while True:
        try:
            asyncio.run(audio_broadcaster(
                device_idx=None,
                host="127.0.0.1",
                port=8765,
                sample_rate=44100,
                buffer_size=8192,
                sens_thr=0.012
            ))
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[ERROR] ASIO Engine crashed, restarting in 1s: {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()
