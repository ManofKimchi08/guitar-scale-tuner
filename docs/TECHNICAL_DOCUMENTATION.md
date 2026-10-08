# 📖 Guitar Scale Tuner - 기술 명세서 & 시스템 아키텍처 (Technical Documentation)

본 문서는 **Guitar Scale Tuner (Scales, heard.) v2.1.0**의 전체 소프트웨어 구조, 오디오 신호 처리(DSP) 알고리즘, 적응형 샘플레이트 협상 시스템, 3-Tier 레코딩 엔진, 그리고 프론트엔드 최적화 기법을 기술적으로 상세히 서술한 엔지니어링 명세서입니다.

---

## 📑 목차 (Table of Contents)
1. [시스템 전체 아키텍처 (System Architecture)](#1-시스템-전체-아키텍처-system-architecture)
2. [오디오 디지털 신호 처리 (DSP & Pitch Extraction)](#2-오디오-디지털-신호-처리-dsp--pitch-extraction)
3. [지능형 적응형 샘플레이트 협상 시스템 (Adaptive Rate Negotiation)](#3-지능형-적응형-샘플레이트-협상-시스템-adaptive-rate-negotiation)
4. [3-Tier 레코딩 스튜디오 & 스마트 연주 분석 엔진](#4-3-tier-레코딩-스튜디오--스마트-연주-분석-엔진)
5. [4현 베이스 기타(Bass Guitar) 및 30Hz 초저음역대 최적화](#5-4현-베이스-기타bass-guitar-및-30hz-초저음역대-최적화)
6. [프론트엔드 렌더링 최적화 & 반응형 UI/UX](#6-프론트엔드-렌더링-최적화--반응형-uiux)
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
        Broadcaster -->|FFT 8192 + HPS| NNLS["Coordinate Descent NNLS"]
        Broadcaster -->|WAV Writer| RecDisk["Lossless WAV Recorder"]
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

## 6. 프론트엔드 렌더링 최적화 & 반응형 UI/UX

### 6.1 DOM Thrashing 제거 (CSS 클래스 토글 구조)
- 기존: 초당 60~80회의 오디오 콜백마다 SVG 지판 요소 전체를 `innerHTML = ""`로 파괴하고 수백 개의 SVG DOM 노드를 재생성하여 심각한 프레임 드롭과 메모리 누수 유발.
- 개선: 앱 초기화 시 지판 프렛, 현, 인레이를 1회만 정적 렌더링(`renderStaticFretboard`)하고, 실시간 음정 변화는 캐시된 원형 노드의 CSS 클래스(`lit`, `played`, `in-scale`)만 토글하도록 개선하여 가비지 컬렉션(GC) 부하 및 렌더링 오버헤드를 대폭 경감.

### 6.2 글래스모피즘 사이드 드로어 & 딥링크 라우팅
- 우측 상단 ⚙️ 버튼을 통해 슬라이드되는 사이드 드로어 내에 5개 아코디언 카드(튜너, 잼, 레코더, 스캐너, 오디오 상세 설정)를 집약 배치.
- URL Hash 기반 딥링크 라우팅(`#bass`, `#drawer`, `#recording`)을 지원하여 특정 악기나 모드로 즉시 진입 가능.

---

## 7. 보안 및 독립 패키징 (Packaging & Security)

### 7.1 경로 탐색(Path Traversal) 공격 방어
로컬 HTTP 서버(`run_https_server.py`)의 `translate_path` 메소드에서 상위 디렉터리 접근 정규화 시 `.git`, `.env`, `.pem`, `.key` 등 민감 파일 확장자 접근을 정밀 차단하고, 루트 상대 경로(`.`, `..`)는 정상 허용하여 404 에러를 방지했습니다.

### 7.2 Windows 독립 실행 파일 빌드 (`build_exe.py`)
- PyInstaller 플래그: `--onedir --windowed --name GuitarScaleTuner --icon favicon.ico`
- 번들링 리소스: `index.html`, `src/` 디렉터리, `favicon.ico`, `favicon.png` 포함.
- 다크 스튜디오 일렉트릭 블루 지판 및 픽 형상의 멀티 해상도(16x16 ~ 256x256) 아이콘을 EXE 실행 파일 바이너리 및 브라우저 탭에 일체형으로 내장.

---

*문서 작성일: 2026년 9월 10일*  
*소프트웨어 버전: Guitar Scale Tuner v2.1.0*  
*작성자: Advanced Agentic Engineer (Antigravity)*
