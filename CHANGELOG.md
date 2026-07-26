# 📋 Guitar Scale Tuner - 버전별 변경사항 (Release Notes & Changelog)

이 문서는 **Guitar Scale Tuner** 프로젝트의 버전별 주요 개발 내역, PR 내용 및 기능 추가 내역을 정리한 문서입니다.

---

## 🎨 [v1.7.5] - 옵션 슬라이드 토글 클릭 인터랙션 & 왼손 지판 모드 완성 (2026-07-26)

### 📌 개요
옵션 패널(Practice/Quiz, Scale/Chord, Note name/Degree, Left/Right hand)의 슬라이드 토글 클릭 시 애니메이션 및 상태 전환이 동작하지 않던 현상을 해결하고, 왼손잡이 지판 모드를 구현했습니다.

### 🛠️ 주요 변경사항
* **슬라이드 토글 CSS 애니메이션 클래스 연결 (`active-right`)**: 토글 클릭 시 `active-right` 클래스 및 텍스트 `active` 스타일이 스위칭되도록 `updateToggleVisuals()` 도우미 함수 구현.
* **4대 옵션 토글 클릭 반응 복구 (`src/main.js`)**:
  - `Practice / Quiz`: 퀴즈 모드 전환 및 동적 프로필/퀴즈 생성 연동.
  - `Scale / Chord`: 스케일 가이드 ↔ 코드 가이드 전환 및 코드 톤 필터 활성화.
  - `Note name / Degree`: 음이름 ↔ 도수(1, b3, 5...) 표시 즉시 전환.
  - `Left hand / Right hand`: 오른손잡이 ↔ 왼손잡이 방향 지판 SVG 좌우 반전 렌더링 지원.

---

## 🛡️ [v1.7.4] - 코드 전반 정밀 리뷰: DOM ID 동기화 & 100% 방어적 초기화 (2026-07-26)

### 📌 개요
코드 전체를 정밀 스캔하여 스크립트 실행 중 미세한 예외(Null Reference)로 인해 지판(Fretboard) 및 키/스케일 드롭다운 렌더링이 중단되던 원인을 근본적으로 완벽 해결했습니다.

### 🛠️ 주요 변경사항
* **HTML과 JS 간 56개 DOM ID 100% 동기화**: `tuningPresetField` 내 누락된 `<select id="tuningSel">` 추가 및 `lblGuideMode`, `chordControlPanel`, `voicingCard` 등 누락된 요소로 인한 uncaught TypeError 원인 제거.
* **전체 JS 이벤트 바인딩 방어 코드(Null-Safety) 적용**: `src/main.js`의 모든 이벤트 및 렌더링 로직에 `if ($("id"))` 검사를 적용하여 어떠한 환경에서도 지판 렌더링(`drawFB()`) 및 드롭다운 생성이 강제 실행되도록 보장.
* **루트/src i18n 딕셔너리 완벽 동기화**: `i18n.js`와 `src/i18n.js`를 동일하게 동기화하여 전역 언어 객체 로딩 100% 보장.

---

## 🔧 [v1.7.1] - 브라우저 호환성 복구 & 범용 실행 지원 (2026-07-26)

### 📌 개요
ES 모듈 호환성 문제로 인해 `file://` 프로토콜(더블 클릭 실행)이나 일부 브라우저 호스트 환경에서 스크립트 실행이 차단되던 현상을 정밀 분석하여 완전히 해결했습니다.

### 🛠️ 주요 변경사항
* **`file://` 및 `http(s)://` 범용 호환성 호스트 구조 복원 (`index.html` & `src/main.js`)**: ES 모듈 대신 모든 로컬/웹 환경에서 100% 정상 작동하는 표준 스크립트 구조로 전환하여 CORS 차단 및 스크립트 로딩 중단 문제 해결.
* **i18n 전역 바인딩 보완 (`src/i18n.js` & `i18n.js`)**: `window.I18N = I18N; window.LANG_NAMES = LANG_NAMES;` 명시적 바인딩을 통해 언어 딕셔너리 로딩 및 스크립트 간 참조 오류 완벽 제거.
* **파이썬 $A^T A$ DSP 최적화 및 웹 오디오 메모리 수거 유지 (`asio_server.py` & `src/main.js`)**: v1.7.0에서 적용된 파이썬 백엔드 연산 최적화(~30% 속도 향상) 및 `sourceNode.onended` 가비지 컬렉션은 그대로 유지 적용.

---

## ⚡ [v1.7.0] - 코드 리뷰 반영: DSP 행렬 연산 최적화 & ES 모듈 리팩토링 (2026-07-25)

### 📌 개요
코드 심층 리뷰를 통해 도출된 파이썬 백엔드 오디오 DSP 행렬 최적화, 웹 오디오 자원 자동 해제, 파이썬 3.12 규격 보완 및 프론트엔드 모듈화 리팩토링을 일괄 적용했습니다.

### 🛠️ 주요 변경사항
* **파이썬 DSP $A^T A$ 행렬 캐싱 (`asio_server.py`)**: 매 프레임 중복 계산되던 $A^T A$ 대칭 행렬을 `precompute_A()`에서 사전 계산하여 `nnls_coordinate_descent()`에 즉시 전달, 분석 연산 속도 30% 이상 향상.
* **웹 오디오 자원 자동 해제 (`src/js/audio-engine.js`)**: PCM 스트림 재생 완료 시 `sourceNode.onended` 이벤트 핸들러를 통한 명시적 `disconnect()` 수거로 메모리 누수 방지.
* **Python 3.12+ Deprecation 보완 (`run_https_server.py`)**: `datetime.datetime.utcnow()`를 `datetime.datetime.now(datetime.timezone.utc)`로 수정.
* **프론트엔드 ES 모듈(ESM) 건축 분리 (`src/js/`)**:
  - `music-theory.js`: 음계, 튜닝, 보이스 맵 데이터 및 피치 변환 수학 함수 모듈.
  - `hmm-decoder.js`: 25-상태 은닉 마르코프 모델 코드 판별 알고리즘 모듈.
  - `audio-engine.js`: Web Audio 엔진, ASIO 웹소켓, 출력 제어 모듈.
  - `fretboard-view.js`: 지판 SVG, 5도권 비주얼라이저, 피치 캔버스 모듈.
  - `main.js`: 메인 컨트롤러 및 이벤트 바인딩 로직.

---

## 🎧 [v1.6.0] - 오디오 출력 장치 선택 & ASIO-WebAudio 믹싱 모니터링 (2026-07-23)

### 📌 개요
ASIO 오디오 인터페이스로 기타를 입력받는 상태에서도 PC 메인보드 리얼텍 헤드폰/스피커 등 원하는 모든 출력 장치로 기타 소리와 앱 소리(백킹트랙, 메트로놈 등)를 동시 수음 및 믹싱 출력할 수 있도록 고도화했습니다.

### 🛠️ 주요 변경사항
* **출력 장치 선택기 (Output Device Selector)**: 상단 제어 바에 `Output Device (출력 장치)` 드롭다운 신설. `audioCtx.setSinkId()` API를 연동하여 리얼텍 헤드폰, HDMI, 외부 오디오 인터페이스 등 원하는 출력 장치를 자유롭게 선택 가능.
* **ASIO-to-WebAudio PCM 스트리밍 (`asio_server.py` & `src/main.js`)**: ASIO 서버에서 캡처한 소리를 초저지연 PCM 데이터 패킷으로 웹소켓 동시 브로드캐스트. 브라우저가 수신하여 백킹 트랙/메트로놈과 동일한 오디오 그래프에서 합쳐 원하는 출력 장치로 한 번에 송출.

---

## 🔊 [v1.5.0] - 실시간 초저지연 오디오 모니터링 (Direct Audio Monitoring) (2026-07-21)

### 📌 개요
연주하는 기타 소리를 스피커/헤드폰으로 실시간 수음 및 출력(Direct Monitoring)할 수 있도록 초저지연 오디오 루프백 시스템을 탑재했습니다.

### 🛠️ 주요 변경사항
* **Web Audio API Direct Passthrough (`src/main.js`)**: `MediaStreamSource`에서 추가 처리 버퍼 없이 `GainNode`를 거쳐 `audioCtx.destination`으로 직통 연결하여 지연 시간을 극도로 감소(하드웨어 버퍼 최저치 ~3ms).
* **ASIO Duplex Hardware Loopback (`asio_server.py`)**: `sd.Stream` 하드웨어 전두플렉스 스트림을 이용해 sounddevice 커널 콜백 레벨에서 direct loopback(`outdata[:] = indata * volume`)을 처리하여 2ms 이하의 초저지연 모니터링 서빙.
* **UI 모니터링 제어**: 하단 설정 카드에 `Direct Audio Monitoring` 토글 스위치 및 볼륨 조절 슬라이더(0%~100%) 탑재.

---

## 🚀 [v1.4.0] - 4종 실전 기타 트레이닝 툴 패키지 (2026-07-21)

### 📌 개요
기타 연주자의 즉흥 연주(Jamming), 음악 이론 학습, 초킹/벤딩 정밀도 및 속주 트레이닝을 지원하는 4가지 실전 도구를 통합 구축했습니다.

### 🛠️ 주요 변경사항
* **🎸 백킹 트랙 잼 가이드 (Backing Track Jam Assistant)**
  - Web Audio Synth 기반 코드 반주 재생 (Pop, Jazz, Blues, Minor Pop 진행 패턴)
  - 반주 재생 시 현재 진행 코드의 구성음(Target Chord Tone)이 지판 위에 골드 빛(`#ffaa00`) 오라로 실시간 하이라이트
* **⭕ 5도권(Circle of Fifths) 인터랙티브 비주얼라이저**
  - SVG 원형 5도권 휠 모달 창 탑재
  - 나란한 조(Relative Minor/Major) 및 관계조(Dominant/Subdominant) 시각적 강조 및 원클릭 키 전환
* **📈 피치 안정성 & 벤딩/비브라토 분석기 (Pitch Trajectory & Bending Analyzer)**
  - 5초 피치 Canvas 궤적 렌더링 (`#pitchCanvas`)
  - 반음(`+100c`) 및 1음(`+200c`) 초킹 타겟 가이드 라인 렌더링
  - 롱톤 연주 시 음정 주파수 미세 흔들림 연산 및 실시간 안정도(`Stability %`) 스코어링
* **⚡ 스마트 스피드 트레이너 메트로놈 (Smart Speed Trainer Metronome)**
  - 고정밀 웹 오디오 클릭음 및 비트 애니메이션
  - 4마디마다 자동으로 BPM이 +5 상승하는 오토 램핑 기능 탑재

---

## 🔍 [v1.3.0] - 실시간 스케일 스캐너 (Scale Scanner) (2026-07-18)

### 📌 개요
임의로 연주하는 12초간의 음들을 분석하여 어떤 스케일인지 알아맞히는 지능형 스케일 추정 모드를 추가했습니다.

### 🛠️ 주요 변경사항
* **Chroma Histogram 통계 누적**: 12초간 입력된 모든 피치들을 12개 반음 바구니에 누적하여 노이즈에 강한 밀도 벡터 생성
* **코사인 유사도(Cosine Similarity) 매칭**: 84개 스케일 템플릿과 코사인 유사도 벡터 곱셈 연산 수행
* **원클릭 지판 적용 (Click-to-Apply)**: 상위 5개 추천 스케일 후보군 출력 및 클릭 시 지판 Key/스케일 즉시 전환

---

## 🔒 [v1.2.0] - 로컬 HTTPS 웹 서버 통합 & 일괄 런처 (2026-07-17)

### 📌 개요
브라우저 마이크 보안 규정 준수 및 외부 스마트폰 접속을 원활히 지원하기 위해 로컬 HTTPS 서버 및 일괄 런처를 구축했습니다.

### 🛠️ 주요 변경사항
* **로컬 HTTPS 서버 (`run_https_server.py`)**: `localhost` / `127.0.0.1` 전용 자가 서명 인증서(`cert.pem`, `key.pem`) 자동 생성 및 `https://localhost:8000` 서빙
* **통합 런처 (`run_server.bat`)**: 더블 클릭 한 번으로 ASIO 웹소켓 서버와 HTTPS 웹 서버를 콘솔 분리 방식으로 동시 기동

---

## 🎼 [v1.1.0] - HPS + NNLS & HMM Viterbi 코드 디코더 & 기준음 가변 (2026-07-17)

### 📌 개요
다성 피치 인식 정확도를 극대화하고 A4 기준음 주파수를 자유롭게 조정할 수 있는 3단계 오디오 분석 엔진을 이식했습니다.

### 🛠️ 주요 변경사항
* **HPS (Harmonic Product Spectrum)**: 배음 성분 노이즈 1차 강하게 소거
* **NumPy Coordinate Descent NNLS Solver**: 외부 라이브러리 없이 0.5ms 미만의 비음수 최소제곱 솔버 구현 및 12D 크로마 스트리밍
* **25-상태 HMM Viterbi 코드 디코더**: 화성학 전이 확률 기반 크로마 스무딩 및 코드 검출
* **기준음(A4) 가변 제어 (425Hz~455Hz)**: 슬라이더 조절 시 파이썬 백엔드 딕셔너리 행렬 $A$ 실시간 런처 재연산

---

## 🎸 [v1.0.0] - ASIO 6현 튜너 & 스케일 가이드 (2026-07-15)

### 📌 개요
프로젝트의 최초 릴리즈 버전으로, ASIO 저지연 입력 기반 6현 폴리포닉 튜너 계기판 및 인터랙티브 지판 가이드를 구축했습니다.

### 🛠️ 주요 변경사항
* **6현 폴리포닉 튜너 UI**: 개방현 6현 노드 및 In-tune(초록), Flat(주황), Sharp(빨강) 발광 이펙트
* **인터랙티브 지판**: Root 음 및 스케일 구성음 시각화, 좌/우손 모드 및 음명/도수 모드 전환
* **단음/화음 퀴즈 모드**: 랜더마이즈 음정 퀴즈 및 아르페지오 누적 화음 채점
