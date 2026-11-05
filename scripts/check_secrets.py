#!/usr/bin/env python3
"""커밋 금지 파일·비밀값 검사 — git pre-commit 훅(.githooks/pre-commit)과 CI 가 같이 쓴다.

  python3 scripts/check_secrets.py          # 스테이징된 변경만 검사 (커밋 직전)
  python3 scripts/check_secrets.py --all    # 추적 중인 모든 파일 검사 (CI)

걸리면 exit 1. 오탐인 줄은 끝에 `secret-scan: allow` 주석을 달면 통과한다.
"""

import fnmatch
import re
import subprocess
import sys
from pathlib import PurePosixPath

# 파일명(basename) 기준 차단 — 예시·템플릿은 허용
BLOCKED_NAMES = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.jks",
    "*.keystore",
    "*.ppk",
    "id_rsa*",
    "id_dsa*",
    "id_ecdsa*",
    "id_ed25519*",
    ".netrc",
    ".pypirc",
    ".htpasswd",
    "credentials.json",
    "*credentials*.json",
    "service-account*.json",
    "*.tfstate",
    "*.tfstate.*",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
]
ALLOWED_NAMES = [".env.example", ".env.sample", ".env.template", "*.pub"]

# 내용 기준 차단 — 실제 키 형태만 (오탐 줄이려고 일반 password= 류는 제외)
LOCAL_HOSTS = r"(?!localhost|127\.0\.0\.1|0\.0\.0\.0|postgres[:/]|db[:/]|host\.docker\.internal)"
SECRET_PATTERNS = {
    "개인키(private key)": "-----BEGIN ([A-Z]+ )?" + "PRIVATE KEY-----",
    "AWS 액세스 키": r"\b(AKIA|ASIA)[0-9A-Z]{16}\b",
    "GitHub 토큰": r"\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b",
    "Slack 토큰": r"\bxox[abprs]-[0-9A-Za-z-]{10,}",
    "Google API 키": r"\bAIza[0-9A-Za-z_\-]{35}\b",
    "Anthropic API 키": r"\bsk-ant-[A-Za-z0-9_\-]{20,}",
    "OpenAI API 키": r"\bsk-(proj-)?[A-Za-z0-9_\-]{32,}",
    "Stripe 라이브 키": r"\b[rs]k_live_[0-9A-Za-z]{20,}",
    "npm 인증 토큰": "_auth" + r"Token=(?!\$\{)\S+",  # 문자열을 나눠 이 파일 자체가 걸리지 않게 함
    "외부 DB 접속 비밀번호": r"\b[a-z+]+://[^\s:/@]+:[^\s@/]+@" + LOCAL_HOSTS + r"[^\s/:]+",
}
ALLOW_MARK = "secret-scan: allow"
COMPILED = {label: re.compile(p) for label, p in SECRET_PATTERNS.items()}


def git(*args: str) -> bytes:
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def target_files(scan_all: bool) -> list[str]:
    if scan_all:
        out = git("ls-files", "-z")
    else:
        out = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    return [p for p in out.decode().split("\0") if p]


def read(path: str, scan_all: bool) -> bytes:
    """커밋될 내용 기준 — 스테이징 검사는 작업 폴더가 아니라 index 의 내용을 읽는다"""
    if scan_all:
        try:
            with open(path, "rb") as f:
                return f.read()
        except OSError:
            return b""
    return git("show", f":{path}")


def blocked_name(path: str) -> bool:
    name = PurePosixPath(path).name
    if any(fnmatch.fnmatch(name, p) for p in ALLOWED_NAMES):
        return False
    return any(fnmatch.fnmatch(name, p) for p in BLOCKED_NAMES)


def scan_content(path: str, data: bytes) -> list[str]:
    if b"\0" in data[:8000]:  # 바이너리는 건너뜀
        return []
    hits = []
    for no, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
        if ALLOW_MARK in line:
            continue
        for label, rx in COMPILED.items():
            if rx.search(line):
                hits.append(f"  {path}:{no}  — {label}")
    return hits


def main() -> int:
    scan_all = "--all" in sys.argv[1:]
    files = target_files(scan_all)
    bad_names = [f"  {p}" for p in files if blocked_name(p)]
    bad_content = [h for p in files if not blocked_name(p) for h in scan_content(p, read(p, scan_all))]
    if not bad_names and not bad_content:
        return 0

    out = ["", "🚫 커밋 차단: 민감 정보가 포함돼 있습니다.", ""]
    if bad_names:
        out += ["[커밋하면 안 되는 파일]", *bad_names, ""]
        out += ["  → 스테이징에서 빼세요: git restore --staged <파일>", "    (.gitignore 에도 들어 있는지 확인)", ""]
    if bad_content:
        out += ["[비밀값으로 보이는 내용]", *bad_content, ""]
        out += [
            "  → 실제 값은 .env 로 옮기고 코드에서는 환경변수로 읽으세요.",
            f"    오탐이면 해당 줄 끝에 주석으로 `{ALLOW_MARK}` 를 다세요.",
            "",
        ]
    print("\n".join(out), file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
