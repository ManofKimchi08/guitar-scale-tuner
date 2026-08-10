import os
import sys
import time
import socket
import subprocess
import webbrowser
import logging

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

def find_available_port(start_port=8000, max_attempts=20):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    return start_port

def kill_existing_zombies():
    if sys.platform == "win32":
        try:
            my_pid = os.getpid()
            cmd = f'wmic process where "name=\'GuitarScaleTuner.exe\' and processid!={my_pid}" call terminate'
            subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

def main():
    args = sys.argv[1:]

    if "--mode" in args:
        idx = args.index("--mode")
        mode = args[idx + 1] if idx + 1 < len(args) else ""
        if mode == "asio":
            from asio_server import main as asio_main
            sys.argv = [sys.argv[0]]
            asio_main()
            return
        elif mode == "web":
            port = 8000
            if "--port" in args:
                p_idx = args.index("--port")
                port = int(args[p_idx + 1])
            from run_https_server import run_server
            sys.argv = [sys.argv[0]]
            run_server(port=port)
            return

    kill_existing_zombies()
    active_port = find_available_port(8000)

    creationflags = 0
    if sys.platform == "win32":
        creationflags = subprocess.CREATE_NO_WINDOW

    if getattr(sys, 'frozen', False):
        cmd_asio = [sys.executable, "--mode", "asio"]
        cmd_web = [sys.executable, "--mode", "web", "--port", str(active_port)]
    else:
        cmd_asio = [sys.executable, os.path.abspath(__file__), "--mode", "asio"]
        cmd_web = [sys.executable, os.path.abspath(__file__), "--mode", "web", "--port", str(active_port)]

    asio_proc = subprocess.Popen(cmd_asio, creationflags=creationflags, cwd=base_dir)
    web_proc = subprocess.Popen(cmd_web, creationflags=creationflags, cwd=base_dir)

    time.sleep(1.2)
    webbrowser.open(f"http://localhost:{active_port}")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            asio_proc.terminate()
            web_proc.terminate()
        except Exception:
            pass

if __name__ == "__main__":
    main()
