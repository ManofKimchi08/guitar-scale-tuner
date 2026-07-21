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

def list_devices():
    """Prints list of all audio devices and hosts APIs, highlight ASIO devices."""
    print("=================== AUDIO DEVICE LIST ===================")
    devices = sd.query_devices()
    host_apis = sd.query_hostapis()
    
    # Print host APIs
    print("\nAvailable Host APIs:")
    for i, api in enumerate(host_apis):
        print(f"  [{i}] {api['name']}")
        
    print("\nInput Devices:")
    for idx, d in enumerate(devices):
        if d['max_input_channels'] > 0:
            api_name = host_apis[d['hostapi']]['name']
            is_asio = "ASIO" in api_name or "ASIO" in d['name']
            asio_tag = "[ASIO] " if is_asio else ""
            print(f"  Device #{idx}: {asio_tag}{d['name']} (API: {api_name}, Input Ch: {d['max_input_channels']}, Default SR: {int(d['default_samplerate'])}Hz)")
    print("=========================================================\n")

def nnls_coordinate_descent(A, y, max_iter=15):
    """NumPy-only Coordinate Descent solver for Non-negative Least Squares."""
    N = A.shape[1]
    x = np.zeros(N, dtype=np.float32)
    # Precompute A.T * A and A.T * y
    AtA = A.T @ A
    Aty = A.T @ y
    for _ in range(max_iter):
        for j in range(N):
            # Compute step
            grad = Aty[j] - AtA[j] @ x + AtA[j, j] * x[j]
            x[j] = max(0.0, grad / AtA[j, j]) if AtA[j, j] > 0 else 0.0
    return x

def precompute_A(sample_rate, buffer_size, ref_pitch):
    """Precomputes the dictionary matrix A for a given reference pitch frequency."""
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
            
    return A

def detect_pitches_nnls(audio_chunk, sr, A, idx_min, idx_max, ref_pitch=440.0, sens_threshold=0.012):
    """Detects multiple pitches and extracts 12D Chroma using HPS + NNLS."""
    rms = np.sqrt(np.mean(audio_chunk ** 2))
    if rms < sens_threshold:
        return [], np.zeros(12, dtype=np.float32), rms
        
    n_fft = len(audio_chunk)
    # Apply Hanning window
    windowed = audio_chunk * np.hanning(n_fft)
    
    # Compute FFT
    fft_vals = np.fft.rfft(windowed)
    mags = np.abs(fft_vals)
    
    # 1. HPS (Harmonic Product Spectrum) - Downsample by 2 and 3 and multiply
    hps = np.copy(mags)
    L2 = len(mags[::2])
    hps[:L2] *= mags[::2]
    L3 = len(mags[::3])
    hps[:L3] *= mags[::3]
    
    # Normalize HPS slice
    hps_max = np.max(hps[idx_min:idx_max]) if len(hps[idx_min:idx_max]) > 0 else 0.0
    if hps_max > 0:
        hps /= hps_max
        
    y = hps[idx_min:idx_max]
    
    # 2. NNLS
    x = nnls_coordinate_descent(A, y)
    
    # 3. Extract detected notes and chroma
    detected = []
    chroma = np.zeros(12, dtype=np.float32)
    
    for j in range(len(x)):
        midi = 40 + j
        chroma[midi % 12] += x[j]
        
        # Note activation threshold
        if x[j] > 0.018:
            # Local max filter to avoid adjacent bleed triggers
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
                
    # Normalize chroma
    c_sum = np.sum(chroma)
    if c_sum > 0:
        chroma /= c_sum
        
    return detected, chroma, rms

async def audio_broadcaster(device_idx, host, port, sample_rate, buffer_size, sens_thr):
    """Captures audio from ASIO device and broadcasts detected pitches over WebSockets."""
    connected_clients = set()
    audio_queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    
    monitor_enabled = False
    monitor_volume = 0.7

    def sd_callback(indata, outdata, frames, time_info, status):
        if status:
            logger.warning(f"SoundDevice status warning: {status}")
        # Send data buffer to asyncio loop
        loop.call_soon_threadsafe(audio_queue.put_nowait, indata.copy()[:, 0])
        if monitor_enabled:
            outdata[:] = indata * monitor_volume
        else:
            outdata.fill(0)

    ref_pitch_val = 440.0
    bin_width = sample_rate / buffer_size
    min_freq = 70.0
    max_freq = 1200.0
    idx_min = int(round(min_freq / bin_width))
    idx_max = int(round(max_freq / bin_width))
    
    # Precompute initial matrix A
    A_matrix = precompute_A(sample_rate, buffer_size, ref_pitch_val)

    async def ws_handler(websocket):
        nonlocal A_matrix, ref_pitch_val, monitor_enabled, monitor_volume
        logger.info(f"Client connected from {websocket.remote_address}")
        connected_clients.add(websocket)
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    if data.get("type") == "set_ref_pitch":
                        val = float(data.get("value", 440.0))
                        if 425.0 <= val <= 455.0:
                            logger.info(f"Updating reference pitch to {val}Hz")
                            ref_pitch_val = val
                            A_matrix = precompute_A(sample_rate, buffer_size, val)
                    elif data.get("type") == "set_monitoring":
                        monitor_enabled = bool(data.get("enabled", False))
                        monitor_volume = float(data.get("volume", 0.7))
                        logger.info(f"Updated monitoring: enabled={monitor_enabled}, vol={monitor_volume}")
                except Exception as e:
                    logger.error(f"Error handling websocket message: {e}")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            connected_clients.remove(websocket)
            logger.info(f"Client disconnected from {websocket.remote_address}")

    # Start WebSocket Server
    server = await websockets.serve(ws_handler, host, port)
    logger.info(f"WebSocket server started on ws://{host}:{port}")
    
    # We maintain a sliding buffer of size `buffer_size` (8192) with a hop size of `hop_size` (2048)
    # This delivers updates every ~46ms while having frequency resolution of an 8192 FFT.
    hop_size = 2048
    sliding_buf = np.zeros(buffer_size, dtype=np.float32)
            
    # Select audio stream
    try:
        device_info = sd.query_devices(device_idx)
        logger.info(f"Opening input device #{device_idx}: {device_info['name']}")
        
        # Attempt to open duplex Stream for hardware-level zero latency direct monitoring
        try:
            stream = sd.Stream(
                device=device_idx,
                channels=(1, 1),
                samplerate=sample_rate,
                blocksize=hop_size,
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
                device=device_idx,
                channels=1,
                samplerate=sample_rate,
                blocksize=hop_size,
                dtype='float32',
                callback=input_only_callback
            )
        
        with stream:
            logger.info(f"ASIO recording started successfully at {sample_rate}Hz.")
            prev_rms = 0.0
            prev_notes = []
            prev_chroma = np.zeros(12, dtype=np.float32).tolist()
            
            while True:
                # Wait for next audio chunk from sounddevice thread
                new_chunk = await audio_queue.get()
                
                # Shift buffer and insert new chunk
                sliding_buf[:-hop_size] = sliding_buf[hop_size:]
                sliding_buf[-hop_size:] = new_chunk
                
                # Measure current RMS
                rms = float(np.sqrt(np.mean(sliding_buf**2)))
                
                # Transient Detection:
                # If RMS rises suddenly by more than 2.0x, and it's above absolute threshold (0.005),
                # we bypass new detection and hold the previous frame's notes.
                is_transient = (rms > 2.0 * prev_rms) and (rms > 0.005) and (prev_rms > 0.001)
                
                chroma = np.zeros(12, dtype=np.float32).tolist()
                if is_transient:
                    notes = prev_notes
                    chroma = prev_chroma
                else:
                    # Detect pitches using HPS + NNLS
                    notes, chroma_arr, rms = detect_pitches_nnls(
                        sliding_buf, 
                        sample_rate, 
                        A_matrix,
                        idx_min,
                        idx_max,
                        ref_pitch=ref_pitch_val,
                        sens_threshold=sens_thr
                    )
                    chroma = chroma_arr.tolist()
                    prev_notes = notes
                    prev_chroma = chroma
                    
                prev_rms = rms
                
                # Prepare JSON response
                payload = json.dumps({
                    "notes": notes,
                    "rms": float(rms),
                    "chroma": chroma
                })
                
                # Broadcast payload to all connected clients
                if connected_clients:
                    await asyncio.gather(
                        *[asyncio.create_task(client.send(payload)) for client in connected_clients],
                        return_exceptions=True
                    )
                
                audio_queue.task_done()
                
    except Exception as e:
        logger.error(f"Error running audio stream: {e}", exc_info=True)
        server.close()
        await server.wait_closed()
        raise e

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
    
    if args.list or args.device is None:
        list_devices()
        if args.list:
            sys.exit(0)
        else:
            print("Please run referencing a specific device, e.g.:")
            print("  python asio_server.py --device 3")
            sys.exit(0)
            
    # Run the server loop
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
