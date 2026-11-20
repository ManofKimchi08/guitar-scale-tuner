#!/usr/bin/env python3
"""Automated security audit for Guitar Scale Tuner (CI & local verification)."""

from __future__ import annotations

import pathlib
import py_compile
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

ALLOWED_HTTP_URL_PREFIXES = (
    "https://github.com/ManofKimchi08/guitar-scale-tuner",
    "https://manofkimchi08.github.io",
    "https://asio4all.org",
    "https://fonts.googleapis.com",
    "https://fonts.gstatic.com",
    "http://www.w3.org/",
    "https://www.w3.org/",
    "http://localhost",
    "https://localhost",
    "http://127.0.0.1",
    "https://127.0.0.1",
)

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"[FAIL] {msg}")


def ok(msg: str) -> None:
    print(f"[OK]   {msg}")


def check_allowed_urls(path: pathlib.Path, text: str) -> None:
    urls = re.findall(r"""https?://[^\s"'`<>()]+""", text)
    for url in urls:
        clean_url = url.rstrip(".,;:")
        if not clean_url.startswith(ALLOWED_HTTP_URL_PREFIXES):
            fail(f"Unapproved external URL in {path.name}: {clean_url}")
    ok(f"All {len(urls)} HTTP(S) URLs in {path.name} match allowlist")


def check_index_html() -> str:
    html_path = REPO_ROOT / "index.html"
    text = html_path.read_text(encoding="utf-8")

    check_allowed_urls(html_path, text)

    # Check CSP meta tag (allow embedded single quotes like 'self' inside double-quoted content="...")
    csp_match = re.search(
        r'<meta\s+http-equiv=["\']Content-Security-Policy["\']\s+content="([^"]+)"',
        text,
        re.IGNORECASE,
    )
    if not csp_match:
        fail("Missing Content-Security-Policy meta tag in index.html")
    else:
        csp = csp_match.group(1)
        csp_ok = True
        required_directives = (
            "script-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'none'",
        )
        for directive in required_directives:
            if directive not in csp:
                fail(f"CSP missing required directive: {directive}")
                csp_ok = False
        script_src = re.search(r"script-src\s+([^;]+)", csp)
        if script_src and ("unsafe-inline" in script_src.group(1) or "unsafe-eval" in script_src.group(1)):
            fail(f"Unsafe keyword in script-src: {script_src.group(1)}")
            csp_ok = False
        if csp_ok:
            ok("index.html CSP directives verified")

    if '<meta name="referrer" content="no-referrer">' not in text:
        fail('index.html missing <meta name="referrer" content="no-referrer">')
    else:
        ok("index.html no-referrer meta tag present")

    # Verify all target="_blank" links include rel="...noopener...noreferrer..."
    anchors = re.findall(r"<a\b[^>]*>", text, re.IGNORECASE | re.DOTALL)
    blank_count = 0
    for tag in anchors:
        if re.search(r'target\s*=\s*["\']_blank["\']', tag, re.IGNORECASE):
            blank_count += 1
            rel_m = re.search(r'rel\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
            rel_val = rel_m.group(1).lower() if rel_m else ""
            if "noopener" not in rel_val or "noreferrer" not in rel_val:
                fail(f'Anchor with target="_blank" missing noopener/noreferrer: {tag}')
    ok(f"All {blank_count} target=\"_blank\" anchors enforce noopener + noreferrer")

    # Reject inline event handlers like onclick=
    inline_handlers = re.findall(r"\bon[a-z]+\s*=", text, re.IGNORECASE)
    if inline_handlers:
        fail(f"Inline DOM event handler attributes disallowed by strict CSP found: {inline_handlers}")
    else:
        ok("Zero inline DOM event handler attributes in index.html")

    return text


def check_main_js() -> None:
    js_path = REPO_ROOT / "src" / "main.js"
    text = js_path.read_text(encoding="utf-8")

    check_allowed_urls(js_path, text)

    for forbidden in ("eval(", "new Function(", "document.write("):
        if forbidden in text:
            fail(f"Forbidden dynamic code pattern `{forbidden}` found in src/main.js")
    ok("Zero eval / new Function / document.write in src/main.js")

    # Audit every innerHTML assignment: only empty-string clear or static defs literal without `${...}`
    lines = text.splitlines()
    for idx, line in enumerate(lines, start=1):
        if re.search(r"\.innerHTML\s*=", line):
            stripped = line.strip()
            if re.match(r'^.*\.innerHTML\s*=\s*"";?$', stripped):
                continue
            if "defs.innerHTML = `" in stripped:
                end_idx = idx
                while end_idx < len(lines) and "`;" not in lines[end_idx]:
                    end_idx += 1
                block = "\n".join(lines[idx - 1 : end_idx + 1])
                if "${" in block:
                    fail(f"Dynamic interpolation found inside defs.innerHTML around line {idx}")
                continue
            fail(f"Unexpected innerHTML assignment in src/main.js:{idx}: {stripped}")
    ok("All innerHTML assignments in src/main.js are static clears or static SVG defs")

    if "VERIFIED_EXTERNAL_LINKS" not in text or "guardVerifiedExternalLinks" not in text:
        fail("External link allowlist guard missing from src/main.js")
    else:
        ok("External link allowlist guard verified in src/main.js")


def check_python_backend() -> None:
    py_files = [
        REPO_ROOT / "GuitarScaleTuner.py",
        REPO_ROOT / "asio_server.py",
        REPO_ROOT / "run_https_server.py",
        REPO_ROOT / "build_exe.py",
        pathlib.Path(__file__).resolve(),
    ]
    for pf in py_files:
        try:
            py_compile.compile(str(pf), doraise=True)
        except py_compile.PyCompileError as exc:
            fail(f"Python syntax error in {pf.name}: {exc}")
    ok(f"All {len(py_files)} Python source files compiled cleanly")

    http_src = (REPO_ROOT / "run_https_server.py").read_text(encoding="utf-8")
    if "('127.0.0.1', " not in http_src:
        fail("run_https_server.py must bind exclusively to 127.0.0.1")
    for header in ("X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"):
        if header not in http_src:
            fail(f"run_https_server.py missing security header: {header}")
    ok("run_https_server.py loopback binding & HTTP security headers verified")

    asio_src = (REPO_ROOT / "asio_server.py").read_text(encoding="utf-8")
    launcher_src = (REPO_ROOT / "GuitarScaleTuner.py").read_text(encoding="utf-8")
    if "origins=allowed_origins" not in asio_src or "max_size=16384" not in asio_src:
        fail("asio_server.py missing WebSocket origin allowlist or max_size limit")
    if 'default="127.0.0.1"' not in asio_src or 'host="127.0.0.1"' not in launcher_src:
        fail("asio_server.py default host and GuitarScaleTuner.py host must be 127.0.0.1")
    ok("asio_server.py WebSocket origin allowlist, loopback host & size bounds verified")


def check_pinned_requirements() -> None:
    req = (REPO_ROOT / "requirements.txt").read_text(encoding="utf-8").strip().splitlines()
    for line in req:
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if "==" not in s:
            fail(f"Unpinned dependency in requirements.txt: {s}")
    ok("All dependencies in requirements.txt are pinned with ==")


def main() -> int:
    check_index_html()
    check_main_js()
    check_python_backend()
    check_pinned_requirements()
    if failures:
        print(f"\nSecurity audit FAILED with {len(failures)} issue(s).")
        return 1
    print("\nAll security audit checks PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
