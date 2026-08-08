import os
import sys
import time
import threading
import subprocess
import webbrowser
import logging
import asyncio

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("GuitarScaleTunerApp")

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.abspath(__file__))

os.chdir(get_base_dir())

from asio_server import audio_broadcaster
from run_https_server import run_server as run_https

def start_asio_server():
    async def run_asio():
        await audio_broadcaster(
            device_idx=None,
            host="127.0.0.1",
            port=8765,
            sample_rate=44100,
            buffer_size=8192,
            sens_thr=0.012
        )
    asyncio.run(run_asio())

def start_https_server():
    run_https(port=8000)

def main():
    logger.info("Starting Guitar Scale Tuner One-Click Engine...")

    asio_thread = threading.Thread(target=start_asio_server, daemon=True)
    asio_thread.start()

    https_thread = threading.Thread(target=start_https_server, daemon=True)
    https_thread.start()

    time.sleep(1.0)
    url = "http://localhost:8000"
    logger.info(f"Opening app interface at {url}...")
    webbrowser.open(url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Application exited.")

if __name__ == "__main__":
    main()
