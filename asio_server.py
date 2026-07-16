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

def parabolic_interpolation(mags, idx):
    """Refines peak index using parabolic interpolation on magnitude spectrum."""
    if idx <= 0 or idx >= len(mags) - 1:
        return idx
    alpha = mags[idx - 1]
    beta = mags[idx]
    gamma = mags[idx + 1]
    
    denom = 2.0 * beta - alpha - gamma
    if abs(denom) < 1e-9:
        return idx
        
    return idx + 0.5 * (alpha - gamma) / denom

def detect_pitches(audio_chunk, sr, min_freq=70.0, max_freq=1000.0, max_notes=5, sens_threshold=0.012):
    """
    Detects multiple pitches in a windowed audio block using Successive Harmonic Cancellation.
    """
    rms = np.sqrt(np.mean(audio_chunk ** 2))
    if rms < sens_threshold:
        return [], rms
        
    n_fft = len(audio_chunk)
    # Apply Hanning window
    windowed = audio_chunk * np.hanning(n_fft)
    
    # Compute FFT
    fft_vals = np.fft.rfft(windowed)
    mags = np.abs(fft_vals)
    
    # Frequency mapping
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    bin_width = sr / n_fft
    
    # Find bin range for guitar frequencies
    idx_min = np.searchsorted(freqs, min_freq)
    idx_max = np.searchsorted(freqs, max_freq)
    
    work_mags = np.copy(mags)
    detected = []
    
    max_initial_peak = np.max(work_mags[idx_min:idx_max])
    if max_initial_peak < 0.001:  # silence guard
        return [], rms
        
    # Minimum peak threshold (8% of main peak, or absolute threshold)
    peak_threshold = max(max_initial_peak * 0.08, 0.003)
    
    for _ in range(max_notes):
        # Search for highest peak in range
        sub_slice = work_mags[idx_min:idx_max]
        if len(sub_slice) == 0:
            break
            
        max_idx_sub = np.argmax(sub_slice)
        peak_val = sub_slice[max_idx_sub]
        
        if peak_val < peak_threshold:
            break
            
        peak_idx = idx_min + max_idx_sub
        
        # Verify it's a local maximum
        if peak_idx <= 0 or peak_idx >= len(work_mags) - 1:
            # Not a valid peak center, suppress and continue
            work_mags[peak_idx] = 0
            continue
            
        if work_mags[peak_idx] < work_mags[peak_idx - 1] or work_mags[peak_idx] < work_mags[peak_idx + 1]:
            # Suppress non-peaks in range
            work_mags[peak_idx] = 0
            continue
            
        # Parabolic interpolation
        refined_bin = parabolic_interpolation(work_mags, peak_idx)
        freq_est = refined_bin * bin_width
        
        # MIDI note conversion
        if freq_est > 0:
            midi = 69.0 + 12.0 * math.log2(freq_est / 440.0)
            midi_rounded = int(round(midi))
            
            # Guitar range guard: midi note E2 (40) to E6 (88)
            if 36 <= midi_rounded <= 96:
                note_name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi_rounded % 12]
                octave = (midi_rounded // 12) - 1
                
                # Check for duplicate MIDI note in currently detected notes
                # (Allow octaves, but prevent duplicated note triggers)
                if not any(n['midi'] == midi_rounded for n in detected):
                    detected.append({
                        "f": float(round(freq_est, 1)),
                        "midi": midi_rounded,
                        "name": f"{note_name}{octave}"
                    })
        
        # --- SUCCESSIVE HARMONIC CANCELLATION ---
        # Zero out the fundamental bin region (approx +/- 15 Hz)
        cancel_bins_half = max(1, int(round(15.0 / bin_width)))
        
        # Fundamental range
        f_start = max(0, peak_idx - cancel_bins_half)
        f_end = min(len(work_mags), peak_idx + cancel_bins_half + 1)
        work_mags[f_start:f_end] = 0.0
        
        # Cancel Harmonics (2x, 3x, 4x, 5x, 6x)
        for h in range(2, 7):
            h_freq = freq_est * h
            if h_freq > sr / 2:
                break
            h_bin = int(round(h_freq / bin_width))
            h_start = max(0, h_bin - cancel_bins_half)
            h_end = min(len(work_mags), h_bin + cancel_bins_half + 1)
            # Attenuate magnitudes of harmonics instead of completely zeroing them.
            # This allows real octaves in chords to still be detected.
            work_mags[h_start:h_end] *= 0.15

    return detected, rms

async def audio_broadcaster(device_idx, host, port, sample_rate, buffer_size, sens_thr):
    """Captures audio from ASIO device and broadcasts detected pitches over WebSockets."""
    connected_clients = set()
    audio_queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    
    def sd_callback(indata, frames, time_info, status):
        if status:
            logger.warning(f"SoundDevice status warning: {status}")
        # Send data buffer to asyncio loop
        loop.call_soon_threadsafe(audio_queue.put_nowait, indata.copy()[:, 0])

    async def ws_handler(websocket):
        logger.info(f"Client connected from {websocket.remote_address}")
        connected_clients.add(websocket)
        try:
            async for _ in websocket:
                # Do nothing, just keep connection open
                pass
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
        
        # Start sounddevice input stream
        stream = sd.InputStream(
            device=device_idx,
            channels=1,
            samplerate=sample_rate,
            blocksize=hop_size,
            dtype='float32',
            callback=sd_callback
        )
        
        with stream:
            logger.info(f"ASIO recording started successfully at {sample_rate}Hz.")
            prev_rms = 0.0
            prev_notes = []
            
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
                
                if is_transient:
                    notes = prev_notes
                else:
                    # Detect pitches
                    notes, rms = detect_pitches(
                        sliding_buf, 
                        sample_rate, 
                        min_freq=70.0, 
                        max_freq=1000.0,
                        max_notes=5,
                        sens_threshold=sens_thr
                    )
                    prev_notes = notes
                    
                prev_rms = rms
                
                # Prepare JSON response
                payload = json.dumps({
                    "notes": notes,
                    "rms": float(rms)
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
