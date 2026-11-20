# 🔒 Security Policy & Verification Guide (보안 정책 및 무결성 검증 안내)

## 🇰🇷 한국어 안내 (Korean)

### 1. 가장 안전한 사용 방법 (Zero-Download / 소스 직접 실행)
- **무설치 웹 앱 사용 (권장)**: 별도의 `.exe`나 드라이버를 내려받지 않고 **[https://manofkimchi08.github.io/guitar-scale-tuner/](https://manofkimchi08.github.io/guitar-scale-tuner/)** 에서 브라우저 기본 마이크(Web Audio API)만으로 즉시 사용할 수 있습니다.
- **소스 코드 직접 실행**: `.exe` 바이너리를 신뢰하기 어렵다면 저장소를 클론해 파이썬 소스([GuitarScaleTuner.py](GuitarScaleTuner.py))를 직접 실행하세요.

### 2. 공식 외부 링크 & 피싱·가짜 다운로드 주의사항
이 앱에서 연결하는 외부 링크는 아래 공식 도메인으로만 제한되며, 런타임 코드에서도 URL 변조를 차단합니다:
- **`https://github.com/ManofKimchi08/guitar-scale-tuner/releases/latest`** — 공식 GitHub 릴리즈 페이지
- **`https://asio4all.org/`** — ASIO4ALL 공식 사이트 (오디오 인터페이스 제조사의 정품 ASIO 드라이버가 없는 경우에만 선택적으로 참고)

> ⚠️ **주의:** 외부 웹사이트에는 구글 애드센스 등 **광고성 가짜 "Download" 배너**가 표시될 수 있습니다. 반드시 URL과 파일명(`ASIO4ALL_...exe` 등)을 확인하고, 애매한 광고 버튼은 절대 누르지 마세요. 오디오 인터페이스(Focusrite, Yamaha, Steinberg, Audient 등)는 **제조사 공식 홈페이지의 정품 드라이버** 사용을 권장합니다.

### 3. 다운로드한 `.exe` / `.zip` 무결성 검증 (SHA-256 & Build Attestation)
1. **SHA-256 해시 검증** (PowerShell):
   ```powershell
   Get-FileHash .\GuitarScaleTuner-v*-windows-x64.zip -Algorithm SHA256
   Get-FileHash .\GuitarScaleTuner\GuitarScaleTuner.exe -Algorithm SHA256
   ```
   릴리즈에 첨부된 `SHA256SUMS.txt` 값과 1글자도 빠짐없이 일치하는지 확인하세요.
2. **GitHub Build Provenance 출처 증명 확인** ([GitHub CLI](https://cli.github.com/)):
   ```powershell
   gh attestation verify .\GuitarScaleTuner-v*-windows-x64.zip --repo ManofKimchi08/guitar-scale-tuner
   ```

### 4. 내장 보안 방어 계층 (Defense-in-Depth)
- **브라우저 CSP & Referrer 격리**: `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `no-referrer`, 외부 링크 `rel="noopener noreferrer nofollow"` 및 런타임 Allowlist Guard.
- **로컬 서버 격리 (`127.0.0.1`)**: HTTP/WebSocket 서버는 모두 루프백(`127.0.0.1`)에만 바인딩되며, WebSocket은 `localhost` / `127.0.0.1` / `https://manofkimchi08.github.io` Origin만 허용하고 메시지 크기(`16KB`)·입력값을 엄격 검증합니다.
- **자동화된 CI 보안 감사**: 커밋·PR 및 릴리즈 빌드마다 `scripts/security_audit.py`가 허용 도메인, CSP, 동적 HTML/코드 패턴, HTTP 보안 헤더를 검사합니다.

---

## 🇺🇸 English Security Policy

### Verifying Official Downloads
- Official release packages are hosted strictly under **`https://github.com/ManofKimchi08/guitar-scale-tuner/releases`**.
- The optional link **`https://asio4all.org/`** points directly to the official ASIO4ALL website. Always ignore third-party banner ads ("Sponsored Download" buttons) on any external site, and prefer your audio interface manufacturer's official ASIO driver when available.
- Before running any downloaded release archive or executable, verify its SHA-256 digest against `SHA256SUMS.txt` and check GitHub SLSA Build Provenance:
  ```powershell
  Get-FileHash .\GuitarScaleTuner-v*-windows-x64.zip -Algorithm SHA256
  gh attestation verify .\GuitarScaleTuner-v*-windows-x64.zip --repo ManofKimchi08/guitar-scale-tuner
  ```

### Reporting a Vulnerability
If you discover a security issue in this repository or its releases, please open an encrypted/private report via **GitHub Security Advisories** (`Security` tab → `Report a vulnerability`) rather than posting exploit details in public issues.
