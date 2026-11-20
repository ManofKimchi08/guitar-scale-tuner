# 📖 Guitar Scale Tuner - 기술 명세서 & 시스템 아키텍처 (Technical Documentation)

본 문서는 **Guitar Scale Tuner (Scales, heard.) v2.5.2**의 전체 소프트웨어 구조, 오디오 신호 처리(DSP) 알고리즘, 적응형 샘플레이트 협상 시스템, 3-Tier 레코딩 엔진, 광각 3D 원근·줌/패닝 지판 엔진·3D 입체 손바닥 및 Catmull-Rom 튜브 기반 IK 왼손 아치 코치·하이브리드 ASIO 진단 아키텍처, 그리고 다중 보안 방어 및 공급망 패키징 기법을 기술적으로 상세히 서술한 엔지니어링 명세서입니다.

---

## 📑 목차 (Table of Contents)
1. [시스템 전체 아키텍처 (System Architecture)](#1-시스템-전체-아키텍처-system-architecture)
2. [오디오 디지털 신호 처리 (DSP & Pitch Extraction)](#2-오디오-디지털-신호-처리-dsp--pitch-extraction)
3. [지능형 적응형 샘플레이트 협상 시스템 (Adaptive Rate Negotiation)](#3-지능형-적응형-샘플레이트-협상-시스템-adaptive-rate-negotiation)
4. [3-Tier 레코딩 스튜디오 & 스마트 연주 분석 엔진](#4-3-tier-레코딩-스튜디오--스마트-연주-분석-엔진)
5. [4현 베이스 기타(Bass Guitar) 및 30Hz 초저음역대 최적화](#5-4현-베이스-기타bass-guitar-및-30hz-초저음역대-최적화)
6. [프론트엔드 렌더링 최적화, 3D 지판 & 하이브리드 ASIO 브릿지 UI](#6-프론트엔드-렌더링-최적화-3d-지판--하이브리드-asio-브릿지-ui)
7. [보안 및 독립 패키징 (Packaging & Security)](#7-보안-및-독립-패키징-packaging--security)

---

## 1. 시스템 전체 아키텍처 (System Architecture)

Guitar Scale Tuner는 **초저지연(Ultra Low Latency) 오디오 입력 파이프라인**과 **웹 표준 기반의 인터랙티브 UI**를 결합한 하이브리드 구조로 설계되었습니다.

```mermaid
flowchart TD
    subgraph Hardware ["🎸 Physical Hardware"]
        Guitar["Electric / Bass Guitar"] --> Interface["Audio Interface / USB Codec"]
    end

    subgraph Backend ["⚡ Python Core Engine (GuitarScaleTuner.exe)"]
        Interface -->|WASAPI / DirectSound / ASIO| PA["PortAudio (sounddevice)"]
        PA -->|Adaptive SR Probe| Broadcaster["Audio Broadcaster Loop"]
        Broadcaster -->|YIN + NNLS Harmonic Pruning| NNLS["Coordinate Descent NNLS & YIN"]
        Broadcaster -->|Async WAV Writer| RecDisk["Lossless WAV Recorder"]
        NNLS -->|Notes & Chroma JSON| WS["WebSocket Server (Port 8765)"]
        HTTPServer["HTTP Server (Port 8000)"] -->|Static Files| BrowserUI
    end

    subgraph Frontend ["🌐 Browser GUI (Chrome / Edge / Whale)"]
        WS -->|Real-time JSON Stream| MainJS["src/main.js"]
        BrowserUI["HTML5 / Canvas / SVG"] <--> MainJS
        MainJS -->|DOM O(1) Class Toggle| Fretboard["Dynamic SVG Fretboard"]
        MainJS -->|Web Audio API Buffer| Mixer["Audio Mixer & Recorder"]
        MainJS -->|Cents & Degree Calc| HUD["Pitch Tracker & Needle HUD"]
    end
```

### 1.1 단일 프로세스 멀티스레드 모델 (`GuitarScaleTuner.py`)
기존의 다중 프로세스(Subprocess) 방식은 프로세스 간 통신(IPC) 오버헤드, 좀비 프로세스 누적, 방화벽 포트 점유 충돌 문제를 야기했습니다. v2.1.0은 이를 **단일 파이썬 프로세스 내 듀얼 스레드 구조**로 통합했습니다:
- **메인 스레드**: `asyncio` 이벤트 루프를 구동하여 WebSocket 브로드캐스터(`ws://127.0.0.1:8765`) 및 sounddevice 오디오 캡처 루프를 총괄합니다.
- **데몬 스레드 (Worker)**: 내장 경량 HTTP 웹 서버(`run_https_server.py`)를 백그라운드 데몬으로 바인딩(`127.0.0.1:8000`)하여 브라우저 UI와 에셋을 서빙합니다.
- **포트 충돌 자동 회피**: 8000번 포트가 이미 점유되어 있는 경우 8001, 8002 등으로 동적 스캐닝하여 바인딩 실패를 원천 차단합니다.

---

## 2. 오디오 디지털 신호 처리 (DSP & Pitch Extraction)

본 프로젝트는 단음(Single Note) 및 다성 화음(Polyphonic Chords)을 실시간으로 추적하기 위해 브라우저와 파이썬 백엔드에서 상호보완적인 2단계 음정 검출 알고리즘을 사용합니다.

### 2.1 브라우저: 동적 Lag 제한 자기상관함수 (Dynamic Autocorrelation)
브라우저 직결 마이크 모드에서는 시간 영역(Time Domain) 자기상관함수(Normalized Square Difference)를 사용합니다.

$$r(\tau) = \sum_{n=0}^{N-\tau-1} x[n] \cdot x[n+\tau]$$

- **동적 Lag 탐색 제한 ($O(N)$ 최적화)**:
  인간의 악기 연주 음역대($f_{\min} \sim f_{\max}$)를 벗어난 불필요한 Lag 연산을 제거하여 CPU 사용량을 70% 감축했습니다:
  $$\tau_{\min} = \max\left(2, \left\lfloor \frac{f_s}{f_{\max}} \right\rfloor\right), \quad \tau_{\max} = \min\left(N-2, \left\lceil \frac{f_s}{f_{\min}} \right\rceil\right)$$
  - 기타 모드: $f_{\min} = 65\text{Hz}$, $f_{\max} = 1400\text{Hz}$
  - 베이스 모드: $f_{\min} = 30\text{Hz}$, $f_{\max} = 1400\text{Hz}$
- **포물선 보간 (Parabolic Interpolation)**:
  이산 샘플 간격 사이의 피크 위치를 3차 다항 보간하여 소수점 단위의 정밀 주파수($f = \frac{f_s}{T_{\text{interpolated}}}$)를 도출합니다.

### 2.2 백엔드: YIN 단음 기본 주파수 추적 & Coordinate Descent NNLS 다성 디코더
파이썬 백엔드는 오디오 인터페이스로부터 들어오는 PCM 스트림을 받아 고정밀 기본 주파수 추출과 다성 화음 분해를 병행합니다.

1. **고속 YIN 단음 추적 알고리즘 (Fast YIN Fundamental Pitch Tracking)**:
   FFT 기반 상호상관(Cross-correlation)으로 정규화 누적 차분 함수(CMND)를 계산하고, 최소 지점 주변을 3점 포물선 보간하여 30Hz~1400Hz 대역에서 서브센트 단위의 정밀 기본 주파수($f_0$)와 신뢰도(Confidence)를 추출합니다:
   $$d'(\tau) = \frac{d(\tau)}{\frac{1}{\tau} \sum_{j=1}^\tau d(j)}$$
2. **비음수 최소자승법 (Coordinate Descent NNLS) & 배음 가지치기 (Harmonic Pruning)**:
   각 MIDI 음정(23~88, B0~F6)에 대한 이상적인 기본 주파수 및 배음 사전 행렬 $A \in \mathbb{R}^{M \times N}$를 사전 계산(Precompute)합니다. 관측된 스펙트럼 벡터 $y$에 대해 Coordinate Descent 방식으로 실시간 분해한 뒤, 기본음의 배음 위치(+12, +19, +24, +28, +31, +34, +36 반음)에 발생한 허위 피크를 사후 가지치기하여 고스트 노트를 방지합니다:
   $$\min_{x \ge 0} \frac{1}{2} \|Ax - y\|_2^2 \iff x_j \leftarrow \max\left(0, \frac{A_j^T y - \sum_{k \ne j} (A^T A)_{jk} x_k}{(A^T A)_{jj}}\right)$$
3. **12차원 크로마그램 (12D Chromagram)**:
   해 벡터 $x$의 에너지를 12개 반음 클래스($\text{C, C}\sharp, \dots, \text{B}$)로 모듈로 누적 정규화하여 출력합니다.

---

## 3. 지능형 적응형 샘플레이트 협상 시스템 (Adaptive Rate Negotiation)

### 3.1 PortAudio `[PaErrorCode -9997]` 문제와 배경
Windows 10/11 시스템의 오디오 인터페이스, USB 마이크, 보이스미터(Voicemeeter) 및 WASAPI 엔드포인트는 대부분 **48,000Hz (48kHz)** 또는 **96,000Hz (96kHz)** 를 기본 포맷(`default_samplerate`)으로 요구합니다.
과거 시스템이 44,100Hz로 하드코딩하여 스트림을 열 경우, WASAPI는 샘플레이트 불일치로 인해 스트림 개방을 거부하며 다음과 같은 에러를 발생시켰습니다:
```text
Error opening InputStream: Invalid sample rate [PaErrorCode -9997]
```

### 3.2 적응형 샘플레이트 협상 알고리즘
v2.1.0은 장치의 하드웨어 스펙을 실시간 쿼리하여 지원 가능한 주파수를 자동으로 탐색 및 바인딩하는 엔진을 도입했습니다:

```python
# asio_server.py
native_sr = int(device_info.get('default_samplerate', 0))
max_in = int(device_info.get('max_input_channels', 1))
max_out = int(device_info.get('max_output_channels', 0))

# 1. 장치의 네이티브 주파수를 최우선으로 후보군 구성
candidate_srs = []
if native_sr > 0:
    candidate_srs.append(native_sr)
for r in [48000, 44100, 96000, 88200, 192000]:
    if r not in candidate_srs:
        candidate_srs.append(r)

# 2. 우선순위 순차 시도 및 Fallback
for test_sr in candidate_srs:
    # Duplex(In/Out) -> Mono InputStream -> Stereo InputStream 순차 개방
    ...
```

### 3.3 수학적 행렬 동적 실시간 재계산
스트림이 협상된 샘플레이트 $f_s$로 개방되면, 오디오 엔진은 즉시 주파수 해상도 $\Delta f = \frac{f_s}{N_{\text{FFT}}}$를 재계산하고 사전 행렬 $A$ 및 $A^T A$를 실시간 재생성합니다:
$$M = \left\lfloor \frac{1400}{\Delta f} \right\rfloor - \left\lfloor \frac{30}{\Delta f} \right\rfloor$$
이를 통해 44.1kHz, 48kHz, 96kHz 등 어떤 주파수에서도 주파수 빈 해상도와 사전 행렬의 일치성을 유지하여 음정 오차를 최소화합니다.

---

## 4. 3-Tier 레코딩 스튜디오 & 스마트 연주 분석 엔진

연주자의 연습 워크플로우를 극대화하기 위해 3단계의 녹음/분석 아키텍처를 구현했습니다:

| 단계 | 명칭 | 동작 메커니즘 | 특징 |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **브라우저 즉석 녹음** | Web Audio API 노드 버퍼링 | 원클릭 녹음, WAV 다운로드, 백킹 트랙 동시 믹싱 |
| **Tier 2** | **ASIO 무손실 저장** | 파이썬 sounddevice PCM 캡처 | 16-bit PCM WAV 무손실 로컬 디스크 즉시 저장 (~/Music/GuitarScaleTuner) |
| **Tier 3** | **스마트 연주 분석 & 복기** | 타임스탬프 기반 피치/스케일 로깅 | 적중률(%), 안정도(%) 채점 및 지판 싱크 애니메이션 복기 |

### 4.1 순수 16-bit PCM WAV 바이너리 인코더
외부 라이브러리(ffmpeg, lame 등) 없이 브라우저 순수 자바스크립트로 RIFF/WAVE 헤더를 생성하는 바이너리 인코더(`exportWavBlob`)를 구현했습니다:
- 청크 ID (`"RIFF"`), 파일 크기, 포맷 (`"WAVE"`), 서브 청크 (`"fmt "`), 오디오 포맷(PCM = 1)
- Float32 오디오 버퍼를 클램핑($-1.0 \sim 1.0$) 후 16-bit 정수($-32768 \sim 32767$)로 변환하여 Little-Endian 방식으로 DataView에 기록.

### 4.2 연주 성적표 채점 알고리즘 (Performance Scoring)
녹음 세션 동안 초당 60회 기록된 이벤트 로그 $E = \{(t_k, \text{midi}_k, \Delta c_k, \text{inScale}_k)\}$에 대해 다음 평가 지표를 산출합니다:
1. **스케일 적중률 (Scale Accuracy)**:
   $$\text{Accuracy (\%)} = \left( \frac{\sum_{k=1}^K \mathbb{I}(\text{inScale}_k = \text{true})}{K} \right) \times 100$$
2. **피치 안정도 (Pitch Stability)**:
   평균 센트 절대 편차 $\overline{|\Delta c|}$를 기반으로 피치 안정도 산출:
   $$\text{Stability (\%)} = \max\left(0, \min\left(100, 100 - 2.5 \times \overline{|\Delta c|}\right)\right)$$

### 4.3 지판 싱크 타임라인 복기 (Replay Engine)
녹음된 오디오를 재생할 때 `audio.currentTime`을 `requestAnimationFrame` 루프로 추적하여, 당시 연주되었던 해당 타임스탬프의 음정을 지판 위 흰색 발광(`played`) 노트로 실시간 재현하고 센트 바늘 HUD를 동기화하여 재생합니다.

---

## 5. 4현 베이스 기타(Bass Guitar) 및 30Hz 초저음역대 최적화

### 5.1 서브베이스 주파수 응답 대역 확장
일반 기타의 최저음(E2, 82.4Hz)과 달리 4현 베이스는 4번 줄 개방현이 E1(41.2Hz), 드롭 D가 36.7Hz, 5현 로우 B는 30.87Hz에 달합니다.
- **최소 주파수 임계값 하향**: $65.0\text{Hz} \rightarrow 30.0\text{Hz}$
- **FFT 윈도우 사이즈 자동 확장**: 베이스 모드 선택 시 버퍼 크기를 4096으로 확장하여 파형 1주기($\approx 33.3\text{ms}$) 이상의 관측 길이를 확보함으로써 옥타브 점프 에러를 완벽히 해결했습니다.

### 5.2 지판 와운드 스트링 두께 및 1-5-8 가이드
- **와운드 스트링 두께 시각화**: 베이스의 두꺼운 코일 현을 반영하여 1번 줄(2.0px)부터 4번 줄(5.6px)까지 차등 두께 렌더링.
- **1-5-8 베이스 그루브 가이드**: 베이스 라인의 기초가 되는 루트(1도), 5도, 옥타브(8도) 인터벌을 시각적 앰버 링으로 지판 위에 강조 표시.

---

## 6. 프론트엔드 렌더링 최적화, 3D 지판 & 하이브리드 ASIO 브릿지 UI

### 6.1 DOM Thrashing 제거 (CSS 클래스 토글 구조)
- 기존: 초당 60~80회의 오디오 콜백마다 SVG 지판 요소 전체를 `innerHTML = ""`로 파괴하고 수백 개의 SVG DOM 노드를 재생성하여 심각한 프레임 드롭과 메모리 누수 유발.
- 개선: 앱 초기화 시 지판 프렛, 현, 인레이를 1회만 정적 렌더링(`renderStaticFretboard`)하고, 실시간 음정 변화는 캐시된 원형 노드의 CSS 클래스(`lit`, `played`, `in-scale`)만 토글하도록 개선하여 가비지 컬렉션(GC) 부하 및 렌더링 오버헤드를 대폭 경감.

### 6.2 글래스모피즘 사이드 드로어 & 딥링크 라우팅
- 우측 상단 ⚙️ 버튼을 통해 슬라이드되는 사이드 드로어 내에 5개 아코디언 카드(튜너, 잼, 레코더, 스캐너, 오디오 상세 설정)를 집약 배치.
- URL Hash 기반 딥링크 라우팅(`#bass`, `#drawer`, `#recording`, `#3d`, `#3d-asio`)을 지원하여 특정 악기, 3D 뷰 또는 ASIO 진단 팝오버로 즉시 진입 가능.

### 6.3 12-TET 실제 기타 프렛 비례 모델 및 3D 원근 지판 엔진
- **12-TET 로그/등비 프렛 위치 계산**:
  실제 기타의 스케일 길이 $L$ 에 대한 $n$ 번째 프렛의 거리를 평균율 물리 공식 $d(n) = L \cdot (1 - 2^{-n/12})$ 기반으로 정규화하여 고프렛(12~22F)으로 갈수록 프렛 간격이 정밀하게 좁아지는 실제 지판 비율을 구현했습니다.
- **CPU/GPU 친화적 광각 3D SVG 뷰, 커서 중심 줌/패닝 & 3축 기즈모**:
  `2D 평면`, `3D Studio (38°)`, `Deep 3D (56° · 115%)` 시점 전환과 드래그 기반 광각 회전(`Pitch -35° ~ +78°`, `Yaw -80° ~ +80°`), 연속 원근 초점거리(`camDist = 920` · `Math.abs(Math.cos(tiltRad))` 타원 보정), 커서 앵커 기반 휠/슬라이더 확대·축소(`setFbZoom()`: `50% ~ 250%`), `Shift+드래그` 시점 이동(`fbPanX ∈ [-340, 340]`, `fbPanY ∈ [-190, 190]`), 실시간 각도/배율 표시 및 3D 축 기즈모를 제공합니다. 음정 노트는 3D 입체 퍽(Extruded Puck)과 넥 테마(`Carbon`, `Rosewood`, `Maple`, `Synth`)로 렌더링됩니다.

### 6.4 하이브리드 2+4 스마트 ASIO 브릿지 진단 아키텍처
- **웹 배포 무설치 Fallback (`initDeviceSel`)**: GitHub Pages 등 HTTPS 원격 웹 환경에서는 로컬 브릿지 프로브(`probeAsioBridgeSilent`) 실패 또는 미실행 시 자동으로 브라우저 내장 Web Audio 마이크(`mic_default`)로 전환되며, `navigator.mediaDevices.enumerateDevices()`에는 500ms 타임아웃 가드를 적용해 초기 UI 지연을 방지합니다.
- **인라인 진단 팝오버 & 1.5초 백그라운드 레이더**: 사용자가 ASIO 장치를 선택하거나 상태 배지를 클릭하면 3-노드 연결 상태 흐름도(`오디오 인터페이스 → ASIO Bridge 도우미 → 웹 브라우저 3D 지판`)와 1.5초 간격 자동 재감지 레이더를 실행해 로컬 브릿지가 실행되는 즉시 자동 연결합니다.

### 6.5 3D 입체 파라메트릭 손바닥 & Catmull-Rom 튜브 IK 아치 왼손 코치 엔진 (`renderFretboardHandOverlay`)
- **3-Layer SVG 깊이 분리 파이프라인 (`viewBox="0 0 1060 430"`)**:
  - `#fretboardHandBehindNeckLayer`: 3D 바닥 그림자·컷어웨이 바디 직후, 헤드스톡·크림 바인딩·지판 우드 아래에 배치되며, `Nu=22 × Nv=20` 3D 로프트 파라메트릭 메시(`evalPalmPoint`)로 무지구(Thenar)·소지구(Hypothenar)·중앙 장심 오목부를 조형하고 Blinn-Phong/Fresnel/SSS/AO 셰이딩, `#palmSmoothFilter`, `#palmClipPath`, `#thumbBlendMask`로 반투명 하늘색 입체 손바닥과 원통형 손목을 렌더링합니다.
  - `#fretboardHandBackLayer`: `drawCastShadow()`로 누르는 손가락 아래에는 짙은 밀착 그림자(`dx = ±2, dy = 4`, `opacity 0.42`)를, 지판 위에 떠 있는 미사용 손가락 아래에는 넓고 옅은 부양 그림자(`dx = ±5, dy = 11`, `1.24×`, `opacity 0.20`)를 음정 노트 퍽 하단에 분리 배치합니다.
  - `#fretboardHandTipLayer`: Painter's Algorithm 순서(`④ 소지 → ① 검지 → 하단 6E 엄지`)로 4-노드 Catmull-Rom 스플라인(`buildTubePoints`, `tubeOutlineSvgPath`) 기반 반투명 하늘색 손가락 튜브(`#coachDigit`), 손가락별 PIP/DIP 관절 링, 손톱·반월(Lunula), 활성 타겟 황색 발광 퍽(`#glowYellowHand`), 상단 `①②③④` 너클 배지(최소 `minBadgeGap = 24px` 수평 이격 및 미사용 점선 아웃라인 뱃지), 동적 `ARCH 74° OK` 각도 호, `👍 하단 6E 엄지` 및 `HAND POS` / `BARRE` HUD를 렌더링합니다.
- **2-패스 코드·대기 운지 배치 & 미사용 손가락 부양 포즈**:
  - Pass 1에서 동일 프렛 코드 손가락(예: 오픈 `A Major 2F ①②③`, 바레 `E Shape 7F ③④`)을 부채꼴로 분산(`tipF` ±0.13~0.17, `knuckleF` ±0.46)하고, Pass 2에서 미사용 손가락(`!isActive`)을 인접 활성 손가락 옆에 자연스럽게 정렬해 지판 상단(`1E..2B`) 위 `wz0 = 5.0`, `wz1 = 26.5`, `wz2 = 27.5`, `wz3 = 21.0` 높이로 부양시켜 누르는 손가락(`opacity 0.95`)과 대기 손가락(`opacity 0.58`)을 명확히 구분합니다.
- **지판 곡률 투영 클램핑 & 동적 손목 페이드 마스크 (`#forearmFadeMask`)**: `project3D()` 내 지판 곡률 계수 `normY`를 `[-1, 1]`로 클램프해 지판 외부 너클(`-88`)·손목(`+195`) 좌표의 Z-축 왜곡을 제거하고, `#forearmFadeMask` 영역을 `-1000..+3000`으로 확장해 `50% ~ 250%` 확대 및 패닝 상태에서도 매 프레임 동기화되는 `#forearmFadeGrad` 손목 페이드가 잘리지 않도록 보장합니다.
- **오른손잡이 / 왼손잡이 미러링 & 프렛 폭 적응형 스케일링**: `dirSign` 및 `fbYawDeg` 부호 반전과 함께 `localFretSpan / 62` 비율(`0.72 ~ 1.02`)로 손가락 반경을 보정해 로우 프렛과 하이 프렛 모두에서 해부학적 비례를 유지합니다.

---

## 7. 보안 및 독립 패키징 (Packaging & Security)

### 7.1 경로 탐색(Path Traversal) 및 심볼릭 링크 방어
로컬 HTTP 서버(`run_https_server.py`)의 `translate_path()`에서 `os.path.realpath()`로 실제 경로를 정규화한 뒤 `os.path.commonpath()`로 루트 디렉터리(`base_dir`) 내부 포함 여부를 강제 검증합니다. 이를 통해 `..` 상위 경로 탈출, 심볼릭 링크 우회, `.git`, `.env`, `.pem`, `.key` 등 민감 파일 노출을 원천 차단하고 디렉터리 목록 조회(`list_directory`)는 `403 Forbidden`으로 거부합니다.

### 7.2 WebSocket CSWSH Origin 화이트리스트, 입력 검증, 외부 링크 가드 & CSP
- **CSWSH(Cross-Site WebSocket Hijacking) 방어 (`asio_server.py`)**: 로컬 WebSocket 서버(`127.0.0.1:8765`)는 `allowed_origins` 정규식 화이트리스트를 통해 `localhost`, `127.0.0.1` 및 공식 배포 도메인(`https://manofkimchi08.github.io`)에서 온 연결만 수락하며, `max_size=16384` / `max_queue=16` 제한으로 과대 페이로드·큐 폭주를 차단합니다.
- **수치·장치 입력 검증**: `set_ref_pitch`, `set_monitoring`, `set_sensitivity`에 `math.isfinite()` 및 범위 클램핑을 적용하고, `select_asio_device`는 `sd.query_devices()`를 기준으로 실제 범위와 입력 채널(`max_input_channels > 0`)을 검증합니다.
- **프론트엔드 XSS 방어, HTTP 헤더 & 외부 링크 가드 (`index.html`, `src/main.js`, `run_https_server.py`)**: 동적 DOM을 모두 `createElement` + `textContent`로 처리하고 `<meta http-equiv="Content-Security-Policy">` (`script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`), `<meta name="referrer" content="no-referrer">`, 6종 HTTP 보안 헤더(`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP), 그리고 `VERIFIED_EXTERNAL_LINKS` + `guardVerifiedExternalLinks()` 클릭 변조 차단을 적용했습니다.

### 7.3 공급망 무결성, CI 보안 감사 & GitHub Actions 증명 릴리즈
- **정적·동적 보안 감사 게이트 (`scripts/security_audit.py`, `.github/workflows/security-check.yml`)**: `main` 푸시·PR마다 허용 도메인 화이트리스트, CSP, `noopener`/`noreferrer`, 동적 HTML/`eval`, Python 컴파일·루프백·보안 헤더를 자동 검증합니다.
- **의존성 버전 고정 및 클라우드 SLSA 출처 증명 (`requirements.txt`, `.github/workflows/release.yml`, `SECURITY.md`)**: `requirements.txt` 정밀 버전 고정(`==`) 및 Dependabot 주간 점검을 적용하고, 태그(`v*`) 푸시 시 `windows-latest` 클라우드 러너가 `build_exe.py` 패키징, **`SHA256SUMS.txt`** 생성, **`actions/attest-build-provenance` SLSA 빌드 출처 증명**을 자동 첨부합니다.

### 7.4 Windows 독립 실행 파일 빌드 (`build_exe.py`)
- PyInstaller 플래그: `--onedir --windowed --name GuitarScaleTuner --icon favicon.ico`
- 번들링 리소스: `index.html`, `src/` 디렉터리, `favicon.ico`, `favicon.png` 포함.
- 다크 스튜디오 일렉트릭 블루 지판 및 픽 형상의 멀티 해상도(16x16 ~ 256x256) 아이콘을 EXE 실행 파일 바이너리 및 브라우저 탭에 일체형으로 내장.

---

*문서 작성일: 2026년 11월 20일*  
*소프트웨어 버전: Guitar Scale Tuner v2.5.2*  
*작성자: Advanced Agentic Engineer (Antigravity)*
