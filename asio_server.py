import asyncio
import json
import logging
import math
import argparse
import sys
import re
import numpy as np
import sounddevice as sd
import websockets
import os
import wave
import datetime

def get_recordings_dir():
    """Returns safe persistent directory for audio recordings."""
    if getattr(sys, 'frozen', False):
        user_music = os.path.join(os.path.expanduser("~"), "Music", "GuitarScaleTuner", "recordings")
        try:
            os.makedirs(user_music, exist_ok=True)
            return user_music
        except Exception:
            pass
        exe_dir = os.path.dirname(sys.executable)
        local_rec = os.path.join(exe_dir, "recordings")
        os.makedirs(local_rec, exist_ok=True)
        return local_rec
    rec_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
    os.makedirs(rec_dir, exist_ok=True)
    return rec_dir

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

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
            if "WDM-KS" in api_name.upper():
                continue
            name = d['name']
            is_asio = "ASIO" in api_name.upper() or "ASIO" in name.upper() or "USB" in name.upper() or "CODEC" in name.upper()
            result.append({
                "id": idx,
                "name": name,
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
    min_freq = 30.0 # Support Bass down to B0 (30.87Hz) and E1 (41.2Hz)
    max_freq = 1400.0
    idx_min = int(round(min_freq / bin_width))
    idx_max = int(round(max_freq / bin_width))
    M = idx_max - idx_min
    notes_range = range(23, 89) # B0 to F6 (66 notes covering Bass & Guitar)
    N = len(notes_range)
    A = np.zeros((M, N), dtype=np.float32)
    
    for j, midi in enumerate(notes_range):
        f0 = ref_pitch * (2.0 ** ((midi - 69.0) / 12.0))
        num_harmonics = 6 if midi < 48 else 4
        for h in range(1, num_harmonics + 1):
            fh = f0 * h
            if fh >= max_freq:
                break
            weight = 1.0 / (h ** 0.85)
            b_exact = (fh / bin_width) - idx_min
            semi_bw = (fh * 0.059463) / bin_width
            sigma = max(0.36, min(0.95, 0.35 * semi_bw))
            b_center = int(round(b_exact))
            for offset in [-1, 0, 1]:
                target_bin = b_center + offset
                if 0 <= target_bin < M:
                    dist = target_bin - b_exact
                    spread = math.exp(-0.5 * (dist / sigma) ** 2)
                    if spread > 0.05:
                        A[target_bin, j] += weight * spread
                    
        norm = np.linalg.norm(A[:, j])
        if norm > 0:
            A[:, j] /= norm
            
    AtA = A.T @ A
    return A, AtA

def fast_yin_diff(x, w, max_tau):
    """Computes difference function for YIN using fast FFT correlation."""
    x64 = np.asarray(x, dtype=np.float64)
    x_sq = x64 ** 2
    cumsum_sq = np.concatenate(([0.0], np.cumsum(x_sq)))
    tau_indices = np.arange(max_tau + 1)
    energy = (cumsum_sq[w] - cumsum_sq[0]) + (cumsum_sq[tau_indices + w] - cumsum_sq[tau_indices])
    
    n_fft = 2 ** int(np.ceil(np.log2(w + max_tau + w)))
    fx1 = np.fft.rfft(x64[:w][::-1], n_fft)
    fx2 = np.fft.rfft(x64[:w + max_tau], n_fft)
    conv = np.fft.irfft(fx1 * fx2, n_fft)
    corr = conv[w - 1 : w + max_tau]
    
    diff = energy - 2.0 * corr
    diff[diff < 0] = 0.0
    return diff

def fast_yin(audio_chunk, sr, min_freq=30.0, max_freq=1400.0, threshold=0.15):
    """High-accuracy monophonic fundamental pitch estimation (YIN algorithm with parabolic interpolation)."""
    n = len(audio_chunk)
    min_tau = max(1, int(sr / max_freq))
    max_tau = min(n - 64, int(sr / min_freq))
    w = n - max_tau
    if w <= 0 or max_tau <= min_tau:
        return -1.0, 0.0
        
    diff = fast_yin_diff(audio_chunk, w, max_tau)
    cmnd = np.ones(max_tau + 1, dtype=np.float64)
    cum = np.cumsum(diff[1:max_tau + 1])
    taus = np.arange(1, max_tau + 1, dtype=np.float64)
    with np.errstate(divide='ignore', invalid='ignore'):
        cmnd[1:max_tau + 1] = diff[1:max_tau + 1] / (cum / taus)
    cmnd[0] = 1.0
    
    best_tau = -1
    for tau in range(min_tau, max_tau):
        if cmnd[tau] < threshold:
            while tau + 1 < max_tau and cmnd[tau + 1] < cmnd[tau]:
                tau += 1
            best_tau = tau
            break
            
    if best_tau == -1:
        best_tau = min_tau + int(np.argmin(cmnd[min_tau:max_tau]))
        if cmnd[best_tau] > 0.40:
            return -1.0, 0.0

    t_val = float(best_tau)
    if 0 < best_tau < max_tau:
        s0 = diff[best_tau - 1]
        s1 = diff[best_tau]
        s2 = diff[best_tau + 1]
        denom = 2.0 * (s0 - 2.0 * s1 + s2)
        if abs(denom) > 1e-12:
            delta = (s0 - s2) / denom
            if abs(delta) < 1.0:
                t_val += delta
            
    freq = float(sr / t_val)
    confidence = float(max(0.0, 1.0 - cmnd[best_tau]))
    return freq, confidence

def refine_peak_fft(mags, n_fft, sr, target_f):
    """Parabolic interpolation of the FFT peak near target_f to get precise measured Hz."""
    target_bin = int(round(target_f * n_fft / sr))
    search_r = max(2, int(round(3.0 * n_fft / sr)))
    lo = max(1, target_bin - search_r)
    hi = min(len(mags) - 2, target_bin + search_r + 1)
    if lo >= hi:
        return target_f
    peak_idx = lo + int(np.argmax(mags[lo:hi]))
    if 0 < peak_idx < len(mags) - 1:
        s0 = mags[peak_idx - 1]
        s1 = mags[peak_idx]
        s2 = mags[peak_idx + 1]
        denom = s0 - 2 * s1 + s2
        if abs(denom) > 1e-9:
            delta = 0.5 * (s0 - s2) / denom
            return (peak_idx + delta) * (sr / n_fft)
    return peak_idx * (sr / n_fft)

# Cached window cache for performance
_window_cache = {}

def get_hanning_window(n):
    if n not in _window_cache:
        _window_cache[n] = np.hanning(n)
    return _window_cache[n]

def _save_wav_sync(fname, chunks, sr):
    """Synchronously concatenates audio chunks and writes 16-bit PCM WAV file (run via asyncio.to_thread)."""
    all_pcm = np.concatenate(chunks)
    int16_pcm = np.int16(np.clip(all_pcm, -1.0, 1.0) * 32767)
    with wave.open(fname, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int16_pcm.tobytes())
    return round(len(all_pcm) / sr, 1)

def detect_pitches_nnls(audio_chunk, sr, A, AtA, idx_min, idx_max, ref_pitch=440.0, sens_threshold=0.012, f0_yin=-1.0, conf_yin=0.0):
    """Detects polyphonic pitches using NNLS with harmonic pruning and YIN reconciliation, and extracts 12D Chroma."""
    rms = np.sqrt(np.mean(audio_chunk ** 2))
    if rms < sens_threshold:
        return [], np.zeros(12, dtype=np.float32), rms
        
    n_fft = len(audio_chunk)
    window = get_hanning_window(n_fft)
    windowed = audio_chunk * window
    
    fft_vals = np.fft.rfft(windowed)
    mags = np.abs(fft_vals)
    
    # NNLS on normalized spectrum directly (avoid HPS which destroys harmonics)
    mag_max = np.max(mags[idx_min:idx_max]) if len(mags[idx_min:idx_max]) > 0 else 0.0
    y = (mags[idx_min:idx_max] / mag_max) if mag_max > 0 else mags[idx_min:idx_max]
    Aty = A.T @ y
    
    x = nnls_coordinate_descent(AtA, Aty, max_iter=15)
    max_x = float(np.max(x)) if len(x) > 0 else 0.0
    amp_floor = max(0.06, 0.22 * max_x)
    bin_width = sr / n_fft
    
    candidates = []
    chroma = np.zeros(12, dtype=np.float32)
    
    for j in range(len(x)):
        midi = 23 + j
        chroma[midi % 12] += x[j]
        
        if x[j] >= amp_floor:
            is_local_max = True
            if j > 0 and x[j] < x[j - 1]:
                is_local_max = False
            if j < len(x) - 1 and x[j] < x[j + 1]:
                is_local_max = False
            if is_local_max:
                f_nom = ref_pitch * (2.0 ** ((midi - 69.0) / 12.0))
                b_idx = int(round(f_nom / bin_width)) - idx_min
                lo_b = max(0, b_idx - 1)
                hi_b = min(len(y), b_idx + 2)
                f0_energy = float(np.max(y[lo_b:hi_b])) if hi_b > lo_b else 0.0
                if f0_energy >= 0.05:
                    candidates.append({'j': j, 'midi': midi, 'amp': float(x[j])})
                
    # Harmonic pruning: remove phantom overtones (+12, +19, +24, +28, +31, +34, +36 semitones)
    harm_offsets = [12, 19, 24, 28, 31, 34, 36]
    yin_midi = -1
    if f0_yin > 0 and conf_yin >= 0.65:
        cand_yin_midi = int(round(69.0 + 12.0 * math.log2(f0_yin / ref_pitch)))
        if 23 <= cand_yin_midi <= 88:
            b_yin = int(round(f0_yin / bin_width)) - idx_min
            lo_y = max(0, b_yin - 1)
            hi_y = min(len(y), b_yin + 2)
            yin_f0_energy = float(np.max(y[lo_y:hi_y])) if hi_y > lo_y else 0.0
            if yin_f0_energy >= 0.12:
                yin_midi = cand_yin_midi

    # Check if signal is clearly monophonic (single dominant pitch at yin_midi)
    strong_non_harmonic_cands = 0
    if yin_midi > 0:
        for c in candidates:
            d = c['midi'] - yin_midi
            if abs(d) > 2 and not any(abs(d - h) <= 1 for h in harm_offsets):
                if c['amp'] >= 0.35 * max_x:
                    strong_non_harmonic_cands += 1
    is_monophonic_yin = (yin_midi > 0 and strong_non_harmonic_cands == 0)

    detected = []
    found_yin_midi = False
    for cand in candidates:
        is_harmonic = False
        for lower in candidates:
            if lower['midi'] < cand['midi']:
                diff = cand['midi'] - lower['midi']
                if any(abs(diff - h) <= 1 for h in harm_offsets):
                    if lower['amp'] >= 0.35 * cand['amp']:
                        is_harmonic = True
                        break
        if not is_harmonic and is_monophonic_yin:
            diff_yin = cand['midi'] - yin_midi
            if 0 < abs(diff_yin) <= 2:
                is_harmonic = True
            elif diff_yin < 0 and conf_yin >= 0.72:
                is_harmonic = True
            elif diff_yin > 0 and any(abs(diff_yin - h) <= 1 for h in harm_offsets):
                is_harmonic = True

        if not is_harmonic:
            note_name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][cand['midi'] % 12]
            octave = (cand['midi'] // 12) - 1
            f_nom = ref_pitch * (2.0 ** ((cand['midi'] - 69.0) / 12.0))
            if cand['midi'] == yin_midi and f0_yin > 0:
                f_meas = f0_yin
                found_yin_midi = True
            else:
                f_meas = refine_peak_fft(mags, n_fft, sr, f_nom)
            detected.append({
                "f": float(round(f_meas, 2)),
                "midi": int(cand['midi']),
                "name": f"{note_name}{octave}",
                "amp": cand['amp']
            })

    if is_monophonic_yin and not found_yin_midi:
        note_name = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][yin_midi % 12]
        octave = (yin_midi // 12) - 1
        detected.insert(0, {
            "f": float(round(f0_yin, 2)),
            "midi": int(yin_midi),
            "name": f"{note_name}{octave}",
            "amp": float(max(0.5, max_x))
        })
        chroma[yin_midi % 12] = max(chroma[yin_midi % 12], max(0.5, max_x))
            
    c_sum = np.sum(chroma)
    if c_sum > 0:
        chroma /= c_sum
        
    return detected, chroma, rms

MAX_RECORDING_CHUNKS = 180000  # ~30 minutes safety cap at 48kHz / 512 blocksize

async def audio_broadcaster(device_idx, host, port, sample_rate, buffer_size, sens_thr):
    """Captures audio from ASIO device and broadcasts detected pitches over WebSockets."""
    connected_clients = set()
    audio_queue = asyncio.Queue(maxsize=3)
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
    browser_rec_streaming = False
    ref_pitch_val = 440.0
    is_asio_recording = False
    recorded_audio_chunks = []

    def push_audio(chunk):
        nonlocal is_asio_recording, recorded_audio_chunks
        if is_asio_recording and len(recorded_audio_chunks) < MAX_RECORDING_CHUNKS:
            recorded_audio_chunks.append(chunk.copy())
        if audio_queue.full():
            try:
                audio_queue.get_nowait() # Drop oldest frame to eliminate latency drift
            except Exception:
                pass
        try:
            audio_queue.put_nowait(chunk)
        except Exception:
            pass

    def sd_callback(indata, outdata, frames, time_info, status):
        if status:
            logger.warning(f"SoundDevice status warning: {status}")
        chunk = indata[:, 0].copy() if indata.ndim > 1 else indata.copy()
        loop.call_soon_threadsafe(push_audio, chunk)
        if monitor_enabled:
            outdata[:] = indata * monitor_volume
        else:
            outdata.fill(0)

    bin_width = sample_rate / buffer_size
    min_freq = 30.0
    max_freq = 1400.0
    idx_min = int(round(min_freq / bin_width))
    idx_max = int(round(max_freq / bin_width))
    
    A_matrix, AtA_matrix = precompute_A(sample_rate, buffer_size, ref_pitch_val)

    stream_restart_event = asyncio.Event()

    async def get_device_payload():
        return json.dumps({
            "type": "asio_device_list",
            "devices": get_audio_input_devices(),
            "current_device_id": current_device_id,
            "sample_rate": sample_rate
        })

    async def ws_handler(websocket):
        nonlocal A_matrix, AtA_matrix, ref_pitch_val, monitor_enabled, monitor_volume, current_device_id, sample_rate
        nonlocal is_asio_recording, recorded_audio_chunks, sens_thr, browser_rec_streaming
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
                        monitor_volume = min(1.0, max(0.0, float(data.get("volume", 0.7))))
                        logger.info(f"Updated monitoring: enabled={monitor_enabled}, vol={monitor_volume}")
                    elif msg_type == "set_browser_recording":
                        browser_rec_streaming = bool(data.get("enabled", False))
                        logger.info(f"Updated browser recording PCM stream: enabled={browser_rec_streaming}")
                    elif msg_type == "set_sensitivity":
                        val = float(data.get("value", 0.012))
                        sens_thr = max(0.001, min(0.1, val))
                        logger.info(f"Updated sensitivity threshold to {sens_thr}")
                    elif msg_type == "get_asio_devices":
                        await websocket.send(await get_device_payload())
                    elif msg_type == "select_asio_device":
                        new_id = int(data.get("device_id"))
                        logger.info(f"Switching active audio device to #{new_id}")
                        current_device_id = new_id
                        stream_restart_event.set()
                    elif msg_type == "start_asio_recording":
                        is_asio_recording = True
                        recorded_audio_chunks = []
                        logger.info("Started ASIO studio lossless recording")
                        for c in list(connected_clients):
                            try:
                                await c.send(json.dumps({"type": "asio_recording_started"}))
                            except Exception:
                                pass
                    elif msg_type == "stop_asio_recording":
                        is_asio_recording = False
                        chunks_to_save = list(recorded_audio_chunks)
                        recorded_audio_chunks = []
                        logger.info(f"Stopped ASIO recording ({len(chunks_to_save)} chunks)")
                        if chunks_to_save:
                            try:
                                rec_dir = get_recordings_dir()
                                ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                                fname = os.path.join(rec_dir, f"ASIO_Take_{ts}.wav")
                                duration = await asyncio.to_thread(_save_wav_sync, fname, chunks_to_save, sample_rate)
                                payload = json.dumps({
                                    "type": "asio_recording_saved",
                                    "filename": os.path.abspath(fname),
                                    "duration": duration
                                })
                                for c in list(connected_clients):
                                    try:
                                        await c.send(payload)
                                    except Exception:
                                        pass
                            except Exception as rec_err:
                                logger.error(f"Error saving ASIO recording: {rec_err}")
                except Exception as e:
                    logger.error(f"Error handling websocket message: {e}")
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            connected_clients.remove(websocket)
            if not connected_clients:
                browser_rec_streaming = False
            logger.info(f"Client disconnected from {websocket.remote_address}")

    allowed_origins = [re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"), None]
    server = await websockets.serve(ws_handler, host, port, origins=allowed_origins)
    logger.info(f"WebSocket server started on ws://{host}:{port}")

    while True:
        stream_restart_event.clear()
        while not audio_queue.empty():
            audio_queue.get_nowait()

        device_info = None
        try:
            if current_device_id is not None:
                device_info = sd.query_devices(current_device_id)
                logger.info(f"Opening audio input device #{current_device_id}: {device_info['name']}")
        except Exception as dev_e:
            logger.error(f"Device #{current_device_id} query failed: {dev_e}")
            device_info = None

        if device_info is None:
            input_devs = get_audio_input_devices()
            if input_devs:
                current_device_id = input_devs[0]['id']
                try:
                    device_info = sd.query_devices(current_device_id)
                except Exception:
                    device_info = None

        if device_info is None:
            logger.warning("No audio input devices found. Waiting 1s before retrying...")
            await asyncio.sleep(1.0)
            continue

        native_sr = int(device_info.get('default_samplerate', 0))
        max_in = int(device_info.get('max_input_channels', 1))
        max_out = int(device_info.get('max_output_channels', 0))

        # Build candidate sample rates starting with the device's native rate
        candidate_srs = []
        if native_sr > 0:
            candidate_srs.append(native_sr)
        if sample_rate not in candidate_srs:
            candidate_srs.append(sample_rate)
        for r in [48000, 44100, 96000, 88200, 192000]:
            if r not in candidate_srs:
                candidate_srs.append(r)

        stream = None
        opened_sr = None
        last_stream_err = None

        def input_only_callback(indata, frames, time_info, status):
            if status:
                logger.warning(f"SoundDevice status warning: {status}")
            chunk = indata[:, 0].copy() if indata.ndim > 1 else indata.copy()
            loop.call_soon_threadsafe(push_audio, chunk)

        for test_sr in candidate_srs:
            # 1. Try Duplex Stream if output channels exist on this device
            if max_out > 0:
                try:
                    stream = sd.Stream(
                        device=current_device_id,
                        channels=(1, 1),
                        samplerate=test_sr,
                        blocksize=512,
                        dtype='float32',
                        callback=sd_callback
                    )
                    opened_sr = test_sr
                    logger.info(f"Opened duplex stream on device #{current_device_id} at {opened_sr}Hz")
                    break
                except Exception as duplex_e:
                    logger.debug(f"Duplex open failed on #{current_device_id} at {test_sr}Hz: {duplex_e}")

            # 2. Try InputStream (Mono input)
            try:
                stream = sd.InputStream(
                    device=current_device_id,
                    channels=1,
                    samplerate=test_sr,
                    blocksize=512,
                    dtype='float32',
                    callback=input_only_callback
                )
                opened_sr = test_sr
                logger.info(f"Opened input stream on device #{current_device_id} at {opened_sr}Hz")
                break
            except Exception as in_e:
                logger.debug(f"InputStream open failed on #{current_device_id} at {test_sr}Hz: {in_e}")
                last_stream_err = in_e

            # 3. Fallback: Try stereo input if device requires 2 channels
            if max_in >= 2:
                try:
                    stream = sd.InputStream(
                        device=current_device_id,
                        channels=2,
                        samplerate=test_sr,
                        blocksize=512,
                        dtype='float32',
                        callback=input_only_callback
                    )
                    opened_sr = test_sr
                    logger.info(f"Opened stereo input stream on device #{current_device_id} at {opened_sr}Hz")
                    break
                except Exception as in2_e:
                    last_stream_err = in2_e

        if stream is None:
            logger.error(f"Failed to open stream on device #{current_device_id} with tested rates {candidate_srs}: {last_stream_err}")
            err_payload = json.dumps({
                "type": "asio_error",
                "message": f"선택한 장치를 열 수 없습니다: {last_stream_err}. 다른 오디오 장치(WASAPI/DirectSound)를 선택해 주세요."
            })
            for client in list(connected_clients):
                try:
                    await client.send(err_payload)
                except Exception:
                    pass
            await stream_restart_event.wait()
            continue

        actual_sr = int(stream.samplerate)
        if actual_sr != sample_rate:
            logger.info(f"Sample rate adapted: {sample_rate}Hz -> {actual_sr}Hz for device #{current_device_id}")
            sample_rate = actual_sr
            bin_width = sample_rate / buffer_size
            idx_min = int(round(min_freq / bin_width))
            idx_max = int(round(max_freq / bin_width))
            A_matrix, AtA_matrix = precompute_A(sample_rate, buffer_size, ref_pitch_val)

        payload_dev = await get_device_payload()
        for client in list(connected_clients):
            try:
                await client.send(payload_dev)
                await client.send(json.dumps({
                    "type": "asio_stream_started",
                    "device_id": current_device_id,
                    "sample_rate": sample_rate
                }))
            except Exception:
                pass

        with stream:
            logger.info(f"Audio capture active on device #{current_device_id} ({device_info['name']}).")
            sliding_buf = np.zeros(buffer_size, dtype=np.float32)
            prev_rms = 0.0
            prev_notes = []
            prev_chroma = np.zeros(12, dtype=np.float32).tolist()
            prev_f0 = -1.0
            prev_conf = 0.0

            while not stream_restart_event.is_set():
                try:
                    new_chunk = await asyncio.wait_for(audio_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue

                hop_size = len(new_chunk)
                sliding_buf[:-hop_size] = sliding_buf[hop_size:]
                sliding_buf[-hop_size:] = new_chunk

                rms = float(np.sqrt(np.mean(sliding_buf**2)))
                is_transient = (rms > 2.0 * prev_rms) and (rms > 0.005) and (prev_rms > 0.001)

                chroma = np.zeros(12, dtype=np.float32).tolist()
                f0 = -1.0
                conf = 0.0
                if is_transient:
                    notes = prev_notes
                    chroma = prev_chroma
                    f0 = prev_f0
                    conf = prev_conf
                else:
                    if rms >= sens_thr:
                        yin_win = min(len(sliding_buf), 4096)
                        f0, conf = fast_yin(sliding_buf[-yin_win:], sample_rate, threshold=0.15)
                    notes, chroma_arr, rms = detect_pitches_nnls(
                        sliding_buf, sample_rate, A_matrix, AtA_matrix, idx_min, idx_max,
                        ref_pitch=ref_pitch_val, sens_threshold=sens_thr,
                        f0_yin=f0, conf_yin=conf
                    )
                    if f0 > 0 and notes:
                        yin_m = int(round(69.0 + 12.0 * math.log2(f0 / ref_pitch_val)))
                        if not any(abs(n["midi"] - yin_m) <= 1 for n in notes):
                            f0 = notes[0]["f"] if len(notes) == 1 else -1.0
                    chroma = chroma_arr.tolist()
                    prev_notes = notes
                    prev_chroma = chroma
                    prev_f0 = f0
                    prev_conf = conf

                prev_rms = rms

                payload_data = {
                    "f": float(round(f0, 2)) if f0 > 0 else -1.0,
                    "confidence": float(round(conf, 3)),
                    "notes": notes,
                    "rms": float(rms),
                    "chroma": chroma,
                    "sample_rate": sample_rate
                }
                if monitor_enabled or browser_rec_streaming:
                    payload_data["pcm"] = np.round(new_chunk, 4).tolist()

                payload = json.dumps(payload_data)

                if connected_clients:
                    await asyncio.gather(
                        *[asyncio.wait_for(client.send(payload), timeout=0.05) for client in list(connected_clients)],
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
