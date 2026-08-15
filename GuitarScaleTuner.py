import os
import sys
import time
import socket
import threading
import webbrowser
import logging
import asyncio

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

base_dir = get_base_dir()
os.chdir(base_dir)

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

from run_https_server import run_server, find_available_port
from asio_server import audio_broadcaster

def main():
    active_port = find_available_port(8000)

    # 1. Run HTTP Web Server in background daemon thread
    web_thread = threading.Thread(
        target=run_server,
        kwargs={"port": active_port},
        daemon=True
    )
    web_thread.start()

    # 2. Give web server 0.3s to bind and open browser
    time.sleep(0.3)
    try:
        webbrowser.open(f"http://localhost:{active_port}")
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
