#!/usr/bin/env bash
# PreToolUse(Bash) — 하네스의 git 안전 규칙을 강제한다 (위반이면 exit 2 로 명령 차단).
#   1. 민감 정보 검사 우회 금지: git add -f/--force, git commit --no-verify/-n, core.hooksPath 변경, GIT_CONFIG_* 환경변수
#   2. 브랜치 흐름 (COMMON.md §3-B):
#      - main·dev 위의 git commit 금지 (작업 브랜치에서 커밋 → 검증 후 dev 에 merge)
#      - dev 위의 cherry-pick, merge --no-commit, merge 중 commit -a 금지 (merge 로만 바뀌는 브랜치)
#      - main 은 사람만 — main 으로 전환·merge·브랜치 강제 이동/삭제/이름 변경 금지
#      - 한쪽 덮어쓰기 merge(-X ours/theirs, -s ours) 금지
#      - 브랜치 전환과 commit/merge 를 한 Bash 호출에 섞지 않기 (훅이 실행 전 브랜치로 판정하므로)
#   탐지 범위: `git`, `env … git`, `command git`, `exec git`, `/usr/bin/git`, `sh -c '…git…'` 안의 명령.
#   옵션 검사는 따옴표 안 문자열(커밋 메시지 등)을 뺀 뒤 한다 — 메시지에 "-n" 글자가 있다고 막지 않는다.
# python3 가 없으면 검사할 수 없다 — git 명령이면 조용히 통과시키지 않고 막는다
if ! command -v python3 >/dev/null 2>&1; then
  grep -q 'git' && { echo "python3 가 없어 git 규칙을 검사할 수 없습니다 — make doctor 로 설치 상태를 확인하세요." >&2; exit 2; }
  exit 0
fi
python3 -c '
import json, re, subprocess, sys

try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit(0)
cmd = data.get("tool_input", {}).get("command", "")
cwd = data.get("cwd") or None

def block(msg):
    sys.stderr.write(msg + "\n")
    sys.exit(2)

# heredoc 본문(<<EOF … EOF)은 명령이 아니므로 빼고 본다
code = re.sub(r"<<-?\s*[\x22\x27]?(\w+)[\x22\x27]?[^\n]*\n.*?\n\s*\1\s*(?=\n|$)", "", cmd, flags=re.S)
# sh -c / bash -c 의 인용된 본문은 그 자체가 명령 — 새 줄로 꺼내 같이 본다 (1단계만)
for inner in re.findall(r"(?:^|[;&|(\n])\s*(?:ba|z|da)?sh\s+-l?c\s+(?:\x27([^\x27]*)\x27|\x22((?:\\.|[^\x22\\])*)\x22)", code):
    code += "\n" + (inner[0] or inner[1])
# 옵션·브랜치 검사용 — 따옴표 안 문자열은 빈 문자열로 (커밋 메시지 속 글자를 옵션으로 오인하지 않게)
QUOTED = r"\x27[^\x27]*\x27|\x22(?:\\.|[^\x22\\])*\x22"
scrubbed = re.sub(QUOTED, "\x27\x27", code)

# 명령 위치의 git 만 본다 (문자열 속 설명 문구 오탐 방지). env/command/exec/경로 접두, -c k=v, -C 경로 옵션 허용
GIT = r"(?:^|[;&|(\n])\s*(?:env\s+(?:[A-Za-z_]\w*=\S*\s+)*|command\s+|exec\s+)?(?:\S*/)?git\b((?:\s+-[cC]\s+\S+)*)"
ARGS = r"[^;&|\n]*"

# ── 1. 민감 정보 검사 우회 ──
if re.search(r"(?:^|[;&|(\n])\s*(?:env\s+(?:\S+\s+)*)?GIT_CONFIG_(PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)=", code):
    block("GIT_CONFIG_* 환경변수로 git 설정을 바꾸는 것은 커밋 검사 훅을 끌 수 있어 금지입니다.")
RULES = [
    (GIT + r"\s+add\b" + ARGS + r"\s(-f|--force|-[a-zA-Z]*f[a-zA-Z]*)\b", "git add 강제 옵션(-f/--force)은 .gitignore 를 무시하므로 금지입니다."),
    (GIT + r"\s+commit\b" + ARGS + r"\s(--no-verify|-n|-[a-zA-Z]*n[a-zA-Z]*)\b", "git commit --no-verify/-n 은 민감 정보 검사(pre-commit)를 건너뛰므로 금지입니다."),
    # .githooks 로 설정·조회는 허용, 다른 값·해제·일회성(-c) 지정은 차단
    (r"(?:^|[;&|(\n])\s*(?:\S*/)?git\b" + ARGS + r"(--unset" + ARGS + r"\bcore\.hooksPath\b|\bcore\.hooksPath(=|[ \t]+(?!\.githooks(\s|$|[;&|]))[^\s;&|]))", "core.hooksPath 변경은 커밋 검사 훅을 끄므로 금지입니다 (설정은 make setup 이 담당)."),
]
for pattern, msg in RULES:
    if re.search(pattern, scrubbed):
        block(msg + "\n커밋 차단 사유는 고치지 말고 원인(민감 파일·비밀값)을 스테이징에서 빼세요.")

FLOW = ("\nbranch 흐름: dev 에서 작업 브랜치(feature/{NNN}-{slug} · hotfix/{NNN}-{slug} · feature/refactor-{slug})를 만들어 커밋하고,"
        "\n검증 통과 후 dev 에 git merge --no-ff -m 으로 합칩니다. dev → main 반영은 사람이 직접 합니다 (.claude/skills/COMMON.md §3-B).")

# ── 2-a. main 은 사람만 ──
MAIN = r"(?:\s|^)(?:refs/heads/)?main(?=\s|$|[;&|)])"
if re.search(GIT + r"\s+(switch|checkout)\b" + ARGS + MAIN, scrubbed):
    block("main 브랜치로 전환할 수 없습니다 — main 은 배포용이라 사람만 다룹니다." + FLOW)
if re.search(GIT + r"\s+(branch|update-ref)\b" + ARGS + MAIN, scrubbed) and not re.search(GIT + r"\s+branch\s+(--list\b|-a\b|-r\b|--show-current\b|--contains\b|--merged\b)", scrubbed):
    block("main 브랜치를 옮기거나 지우거나 이름을 바꿀 수 없습니다." + FLOW)
if re.search(GIT + r"\s+branch\b" + ARGS + r"\s(-D|-M|-C|-f|--force|-m|--move|-d|--delete)\b" + ARGS + r"(?:\s|^)dev(?=\s|$|[;&|)])", scrubbed):
    block("dev 브랜치를 옮기거나 지우거나 이름을 바꿀 수 없습니다." + FLOW)

# ── 2-b. 한쪽 덮어쓰기 merge ──
if re.search(GIT + r"\s+merge\b" + ARGS + r"\s(-X\s*(ours|theirs)|--strategy-option[= ](ours|theirs)|-s\s*ours|--strategy[= ]ours)\b", scrubbed):
    block("한쪽 내용으로 덮어쓰는 merge(-X ours/theirs, -s ours)는 금지입니다. 충돌하면 git merge --abort 후 원인을 보고하세요 (COMMON.md §3-B 3번).")

has_commit = re.search(GIT + r"\s+commit\b", scrubbed)
has_merge = re.search(GIT + r"\s+merge\b(?!" + ARGS + r"--abort)", scrubbed)
has_cherry = re.search(GIT + r"\s+cherry-pick\b(?!" + ARGS + r"--(abort|quit))", scrubbed)
commit_all = re.search(GIT + r"\s+commit\b" + ARGS + r"\s(-a|--all|-[a-zA-Z]*a[a-zA-Z]*)\b", scrubbed)
merge_no_commit = re.search(GIT + r"\s+merge\b" + ARGS + r"\s--no-commit\b", scrubbed)

# ── 2-c. 전환과 커밋을 한 호출에 ──
if (has_commit or has_merge or has_cherry) and re.search(GIT + r"\s+(switch|checkout)\b", scrubbed):
    block("브랜치 전환(git switch/checkout)과 commit/merge 는 별도 Bash 호출로 실행하세요 — 훅이 실행 전 브랜치로 판정합니다.")

# ── 2-d. main·dev 위의 commit, main 위의 merge, dev 위의 cherry-pick·--no-commit ──
if has_commit or has_merge or has_cherry:
    m = re.search(GIT + r"\s+(commit|merge|cherry-pick)\b", code)
    opts = (m.group(1) if m else "") or ""
    target = re.findall(r"-C\s+(\S+)", opts)
    where = target[-1].strip("\x22\x27") if target else cwd
    if where and cwd and not where.startswith("/"):
        where = cwd.rstrip("/") + "/" + where
    def git(*args):
        try:
            return subprocess.run(["git", *args], cwd=where, capture_output=True, text=True, timeout=5)
        except (OSError, subprocess.SubprocessError):
            return None
    branch = git("branch", "--show-current")
    current = branch.stdout.strip() if branch else ""
    merging = git("rev-parse", "-q", "--verify", "MERGE_HEAD")
    in_merge = bool(merging and merging.returncode == 0)
    if current == "main":
        block("main 브랜치 위에서는 commit·merge 를 할 수 없습니다 — main 은 사람만 다룹니다." + FLOW)
    if current == "dev":
        if has_cherry:
            block("dev 에는 cherry-pick 으로 커밋을 넣을 수 없습니다 — dev 는 검증 통과한 작업 브랜치의 merge 로만 바뀝니다." + FLOW)
        if merge_no_commit:
            block("dev 에서 merge --no-commit 은 금지입니다 — merge 결과를 편집해 커밋하는 길이 열립니다. --no-ff -m 으로 바로 합치세요." + FLOW)
        if has_commit and (not in_merge or commit_all):
            block("현재 브랜치(dev)에 직접 커밋할 수 없습니다 — dev 는 merge 로만 바뀝니다." + FLOW)
'
