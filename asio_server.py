import asyncio
import json
import logging
import math
import argparse
import sys
import numpy as np
import sounddevice as sd
import websockets

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("ASIOServer")

def get_audio_input_devices():
    """Returns structured list of all audio input devices and host APIs."""
    devices = sd.query_devices()
    host_apis = sd.query_hostapis()
    result = []
    for idx, d in enumerate(devices):
        if d['max_input_channels'] > 0:
            api_name = host_apis[d['hostapi']]['name']
            is_asio = "ASIO" in api_name.upper() or "ASIO" in d['name'].upper()
            result.append({
                "id": idx,
                "name": d['name'],
                "api": api_name,
                "is_asio": is_asio,
                "channels": d['max_input_channels'],
                "default_sr": int(d['default_samplerate'])
            })
    return result

def list_devices():
    """Prints list of all audio devices and host APIs, highlighting ASIO devices."""
    print("=================== AUDIO DEVICE LIST ===================")
    input_devs = get_audio_input_devices()
    for d in input_devs:
        asio_tag = "[ASIO] " if d['is_asio'] else ""
        print(f"  Device #{d['id']}: {asio_tag}{d['name']} (API: {d['api']}, Input Ch: {d['channels']}, Default SR: {d['default_sr']}Hz)")
    print("=========================================================\n")

def nnls_coordinate_descent(AtA, Aty, max_iter=15):
    """NumPy-only Coordinate Descent solver for Non-negative Least Squares."""
    N = AtA.shape[1]
    x = np.zeros(N, dtype=np.float32)
    for _ in range(max_iter):
        for j in range(N):
            grad = Aty[j] - AtA[j] @ x + AtA[j, j] * x[j]
            x[j] = max(0.0, grad / AtA[j, j]) if AtA[j, j] > 0 else 0.0
    return x

def precompute_A(sample_rate, buffer_size, ref_pitch):
    """Precomputes dictionary matrix A and AtA for a given reference pitch frequency."""
    bin_width = sample_rate / buffer_size
    min_freq = 70.0
    max_freq = 1200.0
    idx_min = int(round(min_freq / bin_width))
    idx_max = int(round(max_freq / bin_width))
    M = idx_max - idx_min
    notes_range = range(40, 89) # E2 to E6 (49 notes)
    N = len(notes_range)
    A = np.zeros((M, N), dtype=np.float32)
    
    for j, midi in enumerate(notes_range):
        f0 = ref_pitch * (2.0 ** ((midi - 69.0) / 12.0))
        for h in range(1, 5): # Fundamental + 3 harmonics
            fh = f0 * h
            weight = 1.0 / h
            bin_idx = int(round(fh / bin_width)) - idx_min
            for offset in [-1, 0, 1]:
                target_bin = bin_idx + offset
                if 0 <= target_bin < M:
                    spread = 1.0 if offset == 0 else 0.5
                    A[target_bin, j] += weight * spread
                    
        norm = np.linalg.norm(A[:, j])
        if norm > 0:
            A[:, j] /= norm
            
    AtA = A.T @ A
    return A, AtA

def detect_pitches_nnls(audio_chunk, sr, A, AtA, idx_min, idx_max, ref_pitch=440.0, sens_threshold=0.012):
    """Detects multiple pitches and extracts 12D Chroma using HPS + NNLS."""
    rms = np.sqrt(np.mean(audio_chunk ** 2))
    if rms < sens_threshold:
        return [], np.zeros(12, dtype=np.float32), rms
        
    n_fft = len(audio_chunk)
    windowed = audio_chunk * np.hanning(n_fft)
    
    fft_vals = np.fft.rfft(windowed)
    mags = np.abs(fft_vals)
    
    hps = np.copy(mags)
    L2 = len(mags[::2])
    hps[:L2] *= mags[::2]
    L3 = len(mags[::3])
    hps[:L3] *= mags[::3]
    
    hps_max = np.max(hps[idx_min:idx_max]) if len(hps[idx_min:idx_max]) > 0 else 0.0
    if hps_max > 0:
        hps /= hps_max
        
    y = hps[idx_min:idx_max]
    Aty = A.T @ y
    
    x = nnls_coordinate_descent(AtA, Aty)
    
    detected = []
    chroma = np.zeros(12, dtype=np.float32)
    
    for j in range(len(x)):
        midi = 40 + j
        chroma[midi % 12] += x[j]
        
        if x[j] > 0.018:
            is_local_max = True
            if j > 0 and x[j] < x[j - 1]:
                is_local_max = False
            if j < len(x) - 1 and x[j] < x[j + 1]:
                is_local_max = False
            if is_local_max:
                note_name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12]
                octave = (midi // 12) - 1
                freq_est = ref_pitch * (2.0 ** ((midi - 69.0) / 12.0))
                detected.append({
                    "f": float(round(freq_est, 1)),
                    "midi": int(midi),
                    "name": f"{note_name}{octave}"
                })
                
    c_sum = np.sum(chroma)
    if c_sum > 0:
        chroma /= c_sum
        
    return detected, chroma, rms

async def audio_broadcaster(device_idx, host, port, sample_rate, buffer_size, sens_thr):
    """Captures audio from ASIO device and broadcasts detected pitches over WebSockets."""
    connected_clients = set()
    audio_queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    
    input_devs = get_audio_input_devices()
    current_device_id = device_idx

    if current_device_id is None:
        asio_devs = [d for d in input_devs if d['is_asio']]
        if asio_devs:
            current_device_id = asio_devs[0]['id']
        elif input_devs:
            current_device_id = input_devs[0]['id']
        else:
            current_device_id = 0

    monitor_enabled = False
    monitor_volume = 0.7
    ref_pitch_val = 440.0

    def sd_callback(indata, outdata, frames, time_info, status):
        if status:
            logger.warning(f"SoundDevice status warning: {status}")
        loop.call_soon_threadsafe(audio_queue.put_nowait, indata.copy()[:, 0])
        if monitor_enabled:
            outdata[:] = indata * monitor_volume
        else:
            outdata.fill(0)

    bin_width = sample_rate / buffer_size
    min_freq = 70.0
    max_freq = 1200.0
    idx_min = int(round(min_freq / bin_width))
    idx_max = int(round(max_freq / bin_width))
    
    A_matrix, AtA_matrix = precompute_A(sample_rate, buffer_size, ref_pitch_val)

    stream_restart_event = asyncio.Event()

    async def get_device_payload():
        return json.dumps({
            "type": "asio_device_list",
            "devices": get_audio_input_devices(),
            "current_device_id": current_device_id
        })

    async def ws_handler(websocket):
        nonlocal A_matrix, AtA_matrix, ref_pitch_val, monitor_enabled, monitor_volume, current_device_id
        logger.info(f"Client connected from {websocket.remote_address}")
        connected_clients.add(websocket)

        try:
            await websocket.send(await get_device_payload())
        except Exception as e:
            logger.error(f"Error sending device payload: {e}")

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type")
                    if msg_type == "set_ref_pitch":
                        val = float(data.get("value", 440.0))
                        if 425.0 <= val <= 455.0:
                            logger.info(f"Updating reference pitch to {val}Hz")
                            ref_pitch_val = val
                            A_matrix, AtA_matrix = precompute_A(sample_rate, buffer_size, val)
                    elif msg_type == "set_monitoring":
                        monitor_enabled = bool(data.get("enabled", False))
                        monitor_volume = float(data.get("volume", 0.7))
                        logger.info(f"Updated monitoring: enabled={monitor_enabled}, vol={monitor_volume}")
                    elif msg_type == "get_asio_devices":
                        await websocket.send(await get_device_payload())
                    elif msg_type == "select_asio_device":
                        new_id = int(data.get("device_id"))
                        if new_id != current_device_id:
                            logger.info(f"Switching active audio device to #{new_id}")
                            current_device_id = new_id
                            stream_restart_event.set()
                except Exception as e:
                    logger.error(f"Error handling websocket message: {e}")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            connected_clients.remove(websocket)
            logger.info(f"Client disconnected from {websocket.remote_address}")

    server = await websockets.serve(ws_handler, host, port)
    logger.info(f"WebSocket server started on ws://{host}:{port}")

    while True:
        stream_restart_event.clear()
        while not audio_queue.empty():
            audio_queue.get_nowait()

        try:
            device_info = sd.query_devices(current_device_id)
            logger.info(f"Opening audio input device #{current_device_id}: {device_info['name']}")
        except Exception as dev_e:
            logger.error(f"Device #{current_device_id} query failed: {dev_e}")
            input_devs = get_audio_input_devices()
            if input_devs:
                current_device_id = input_devs[0]['id']
                device_info = sd.query_devices(current_device_id)

        try:
            stream = sd.Stream(
                device=current_device_id,
                channels=(1, 1),
                samplerate=sample_rate,
                blocksize=2048,
                dtype='float32',
                callback=sd_callback
            )
        except Exception as duplex_e:
            logger.info(f"Duplex stream unavailable ({duplex_e}), falling back to InputStream")
            def input_only_callback(indata, frames, time_info, status):
                if status:
                    logger.warning(f"SoundDevice status warning: {status}")
                loop.call_soon_threadsafe(audio_queue.put_nowait, indata.copy()[:, 0])

            stream = sd.InputStream(
                device=current_device_id,
                channels=1,
                samplerate=sample_rate,
                blocksize=2048,
                dtype='float32',
                callback=input_only_callback
            )

        payload_dev = await get_device_payload()
        for client in list(connected_clients):
            try:
                await client.send(payload_dev)
            except Exception:
                pass

        with stream:
            logger.info(f"Audio capture active on device #{current_device_id} ({device_info['name']}).")
            hop_size = 2048
            sliding_buf = np.zeros(buffer_size, dtype=np.float32)
            prev_rms = 0.0
            prev_notes = []
            prev_chroma = np.zeros(12, dtype=np.float32).tolist()

            while not stream_restart_event.is_set():
                try:
                    new_chunk = await asyncio.wait_for(audio_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue

                sliding_buf[:-hop_size] = sliding_buf[hop_size:]
                sliding_buf[-hop_size:] = new_chunk

                rms = float(np.sqrt(np.mean(sliding_buf**2)))
                is_transient = (rms > 2.0 * prev_rms) and (rms > 0.005) and (prev_rms > 0.001)

                chroma = np.zeros(12, dtype=np.float32).tolist()
                if is_transient:
                    notes = prev_notes
                    chroma = prev_chroma
                else:
                    notes, chroma_arr, rms = detect_pitches_nnls(
                        sliding_buf, sample_rate, A_matrix, AtA_matrix, idx_min, idx_max,
                        ref_pitch=ref_pitch_val, sens_threshold=sens_thr
                    )
                    chroma = chroma_arr.tolist()
                    prev_notes = notes
                    prev_chroma = chroma

                prev_rms = rms

                payload_data = {
                    "notes": notes,
                    "rms": float(rms),
                    "chroma": chroma
                }
                if monitor_enabled:
                    payload_data["pcm"] = np.round(new_chunk * monitor_volume, 4).tolist()

                payload = json.dumps(payload_data)

                if connected_clients:
                    await asyncio.gather(
                        *[asyncio.create_task(client.send(payload)) for client in connected_clients],
                        return_exceptions=True
                    )

                audio_queue.task_done()

        logger.info(f"Switching audio device #{current_device_id}...")
        await asyncio.sleep(0.1)

def main():
    parser = argparse.ArgumentParser(description="ASIO to WebSocket Pitch Transceiver for Scale Heard Fretboard Guide")
    parser.add_argument("--list", action="store_true", help="List all available audio devices and exit")
    parser.add_argument("--device", type=int, default=None, help="Device index to capture audio from")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address for WebSocket server")
    parser.add_argument("--port", type=int, default=8765, help="Port size for WebSocket server")
    parser.add_argument("--sr", type=int, default=44100, help="Sample rate for audio capture (default: 44100)")
    parser.add_argument("--buffer", type=int, default=8192, help="FFT buffer size for pitch detection (default: 8192)")
    parser.add_argument("--sens", type=float, default=0.012, help="RMS sensitivity amplitude threshold (default: 0.012)")
    
    args = parser.parse_args()
    
    if args.list:
        list_devices()
        sys.exit(0)
            
    try:
        asyncio.run(audio_broadcaster(
            device_idx=args.device,
            host=args.host,
            port=args.port,
            sample_rate=args.sr,
            buffer_size=args.buffer,
            sens_thr=args.sens
        ))
    except KeyboardInterrupt:
        logger.info("Server stopped by keyboard interrupt.")
    except Exception as e:
        logger.error(f"Fatal server crash: {e}")

if __name__ == "__main__":
    main()
