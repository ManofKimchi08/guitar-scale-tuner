# Scales, heard. 🎸

A fretboard **scale guide** in the browser that **listens to your real guitar** and tells you whether the note you played is in the scale — no quiz answer typing, just play.

- **Practice mode** — play any note; it shows the note name, scale degree, and whether it's *in scale ✓* or *out of scale ✗*.
- **Quiz mode** — it asks for a note (by name or degree); find it anywhere on the neck and play it. Tracks score & streak.
- **Matching is by note name only** (octave-independent). It does not care which string/fret you use.
- Fretboard visualizer: root = red, scale tones = blue, the note you just played glows white.
- Key transpose, degree ↔ note-name toggle, right/left-hand flip, sensitivity & stability controls, input-device picker, live tuner meter.
- **Multilingual** (한국어 / English / 日本語) — add your own in one file.

No build step, no framework, no dependencies. Pure HTML + CSS + JavaScript + the Web Audio API.

## Run it

The microphone needs a secure context, so serve it over `http://localhost` (not `file://`). Easiest options:

**VS Code** — install the *Live Server* extension (recommended in `.vscode/extensions.json`), then right-click `index.html` → *Open with Live Server*.

**Python** (no install) —
```bash
python -m http.server 8000
# then open http://localhost:8000
```

**Node** —
```bash
npx serve .
```

Then click **Start mic**, pick your audio interface as the input device, and play.

---

## ⚡ Low-Latency ASIO Mode (Python WebSocket Server)

For professional, low-latency audio capture (especially on Windows) and **Polyphonic Chord/6-String Tuner recognition**, you can stream audio via the Python ASIO WebSocket bridge.

### 1. Requirements & Installation

Ensure you have Python 3.8+ installed, then install dependencies:
```bash
pip install numpy sounddevice websockets pypdf
```
*On Windows, `sounddevice` naturally supports low-latency WASAPI and ASIO drivers.*

### 2. Run the Audio Server

1. **Find your audio input device index**:
   ```bash
   python asio_server.py --list
   ```
   *Look for your USB Audio interface or ASIO driver in the list and note its ID number.*

2. **Start the server**:
   - **Option A (Interactive Script)**: Double-click **`run_server.bat`** (Windows only). It will list the devices and prompt you to type the device index number.
   - **Option B (Manual command)** (e.g. if device index is `46`):
     ```bash
     python asio_server.py --device 46
     ```
   *The server will start listening on `ws://localhost:8765`.*

### 3. Connect the App

1. Serve the frontend (using VS Code Live Server or python http.server).
2. Open the page, select **`⚡ ASIO (Python Server)`** from the **Input device** dropdown.
3. Click **▶ Start mic** to link with the Python server and stream real-time pitch data.

### 4. Packaging as a Standalone Executable (Optional)

If distributing to non-technical users, you can compile the Python server into a standalone Windows `.exe` file using PyInstaller:
1. Install PyInstaller:
   ```bash
   pip install pyinstaller
   ```
2. Build the executable:
   ```bash
   pyinstaller --onefile asio_server.py
   ```
3. The executable will be generated at `dist/GuitarScaleTuner.exe`. Users can run this executable without installing Python or any packages. (You can also update `run_server.bat` to run `dist/GuitarScaleTuner.exe` instead).

---

## 🎧 Voicemeeter & Low-Latency Optimization Guide (보이스미터 & 레이턴시 최적화 가이드)

오디오 인터페이스(기타 입력)와 메인보드 리얼텍(Realtek 헤드셋/스피커 출력) 혼용 시 지연 시간(레이턴시)을 3~5ms 대로 최소화하는 가이드입니다.

### 1. 보이스미터(Voicemeeter) 버퍼 & 드라이버 설정
- **A1 출력 드라이버 변경**: `MME: Realtek` 대신 **`WDM: Realtek`** 또는 **`KS: Realtek` (Kernel Streaming)** 선택.
- **버퍼 크기 대폭 축소**: `Menu` ➔ `System Settings / Options` ➔ `Buffering WDM`을 **`128`** 또는 **`256`** samples로 설정 *(128 samples 시 지연 약 2.6ms)*.
- **샘플 레이트 통일**: `Preferred Sample Rate`를 **`48000 Hz`**로 통일.

### 2. ASIO4ALL / FlexASIO 초저지연 드라이버 활용 (가장 추천 ⚡)
- [ASIO4ALL 공식 사이트(asio4all.org)](https://asio4all.org/) 무료 설치 후 제어판에서:
  - **입력(Input)**: 오디오 인터페이스 (`USB Audio CODEC` 등) 활성화
  - **출력(Output)**: Realtek 헤드셋 활성화
  - **버퍼 크기**: **`128 Samples`** 이하로 지정하여 3~5ms 초저지연 달성.

### 3. 웹 UI `실시간 모니터링 (소리 출력)` 중복 재생 해제
- 보이스미터나 오디오 인터페이스로 기타 소리를 이미 직접 듣고 계시다면, **웹 화면 하단 `실시간 모니터링 (소리 출력)` 체크박스를 해제**해 주세요. 중복 오디오 지연 없이 100% 쾌적하게 음정 인식 및 지판 가이드만 수행합니다.

## How it works

There is no Web API for ASIO — browsers can't use ASIO drivers directly. Instead this app captures your audio interface through `getUserMedia` + Web Audio, with echo cancellation / noise suppression / auto-gain all disabled (those mangle pitch). The fundamental frequency is found with an autocorrelation (ACF2+) detector, converted to a MIDI note → pitch class, and compared against the selected scale. If you truly need ASIO-level latency, wrap the same logic in Electron with a native PortAudio module.

Files:

```
index.html        # markup, data-i18n hooks
src/style.css     # all styling (CSS variables for theming)
src/i18n.js       # all UI strings, one object per language
src/main.js       # music data, pitch detection, fretboard, app logic
```

## Add a language

Open `src/i18n.js`:

1. Copy the whole `en: { ... }` block.
2. Rename the key (e.g. `es` for Spanish) and translate every value.
3. Add a display name to `LANG_NAMES`.

The language picker updates automatically. Note names (C, C#, …) and degree labels (1, b2, …) are standard notation and are intentionally left untranslated.

## Roadmap ideas

- Metronome and chord-progression backing tracks (like the original tool).
- Chord mode: detect whether a played note is a chord tone vs. tension over a backing track.
- `fftSize` toggle (4096) for stronger low-E detection.
- Quiz timer / mistakes counter.

PRs welcome.

## Acknowledgements

Inspired by **"에휴 (Ehyo)"**, a guitar-practice tool (metronome + fretboard scale guide + chord backing tracks) shared on the DCInside electric-guitar gallery: <https://ehyo.up.railway.app/>. This project is an independent, from-scratch reimplementation focused on the live-recognition idea; no original code was reused.

## License

[MIT](LICENSE) — free to use, modify, and distribute.
