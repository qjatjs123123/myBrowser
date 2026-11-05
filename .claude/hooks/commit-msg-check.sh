#!/usr/bin/env bash
# PreToolUse(Bash) — git commit·git merge 메시지 첫 줄이 커밋 컨벤션(docs/CONVENTIONS.md '### 커밋')을 따르는지 검사.
# 위반이면 exit 2 로 막고 규칙 문서를 다시 읽도록 안내한다.
#   - 메시지 출처: -m/--message(=), 묶음 옵션(-am 등), $(cat <<EOF) heredoc, -F/--file 파일
#   - git merge 는 메시지 지정 필수 (기본 "Merge branch …" 는 규칙 위반) — --ff-only·--abort·--continue·--quit·--no-commit·--squash 제외
#   - heredoc 본문·문자열 속 "git commit" 글자는 명령으로 보지 않는다 (파일 내용 쓰기 오탐 방지)
#   - 메시지 없이 편집기를 여는 commit 은 여기서 판정하지 않는다 (--amend 는 settings 에서 차단)
# python3 가 없으면 검사할 수 없다 — git 명령이면 조용히 통과시키지 않고 막는다
if ! command -v python3 >/dev/null 2>&1; then
  grep -q 'git' && { echo "python3 가 없어 git 규칙을 검사할 수 없습니다 — make doctor 로 설치 상태를 확인하세요." >&2; exit 2; }
  exit 0
fi
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
python3 -c '
import json, os, re, shlex, sys

# 형식 규칙 단일 출처 — git commit-msg 훅과 같은 파일
sys.path.insert(0, os.path.join(sys.argv[1], "scripts"))
from check_commit_msg import help_message, is_valid

NO_MESSAGE_MERGE = {"--ff-only", "--abort", "--continue", "--quit", "--no-commit", "--squash"}
HEREDOC_MSG = re.compile(r"-m\s+\"?\$\(cat\s+<<-?\s*[\x27\"]?(\w+)[\x27\"]?\s*\n(.*?)\n\s*\1", re.S)
HEREDOC_ANY = re.compile(r"<<-?\s*[\x27\"]?(\w+)[\x27\"]?[^\n]*\n.*?\n\s*\1\s*(?=\n|$|\))", re.S)

try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit(0)
cmd = data.get("tool_input", {}).get("command", "")
cwd = data.get("cwd") or os.getcwd()

# 커밋 메시지용 heredoc 은 먼저 꺼내 두고, 그 밖의 heredoc 본문은 지운 뒤 명령을 찾는다
msg_heredoc = HEREDOC_MSG.search(cmd)
code = HEREDOC_ANY.sub("", cmd)
# sh -c / bash -c 의 인용된 본문은 그 자체가 명령 — 구분자와 함께 뒤에 붙여 같이 본다 (1단계만)
for inner in re.findall(r"(?:^|[;&|(\n])\s*(?:ba|z|da)?sh\s+-l?c\s+(?:\x27([^\x27]*)\x27|\x22((?:\\.|[^\x22\\])*)\x22)", code):
    code += "\n; " + (inner[0] or inner[1])
PREFIX = r"(?:env\s+(?:[A-Za-z_]\w*=\S*\s+)*|command\s+|exec\s+)?(?:\S*/)?"
if not re.search(r"(?:^|[;&|(\n])\s*" + PREFIX + r"git\b(\s+-[cC]\s+\S+)*\s+(commit|merge)\b", code):
    sys.exit(0)

def git_args(code):
    """(하위 명령, 그 명령의 인자 토큰, -C 경로) — 연결 연산자 이후는 보지 않는다"""
    try:
        tokens = shlex.split(code, posix=True)
    except ValueError:
        return None, [], None
    WRAP = ("env", "command", "exec")
    for i, t in enumerate(tokens):
        if t != "git" and not t.endswith("/git"):
            continue
        # 앞 토큰이 명령 구분자이거나, env/command/exec·KEY=VAL 래퍼를 거슬러 올라가 구분자에 닿아야 명령 위치의 git
        k = i - 1
        while k >= 0 and (tokens[k] in WRAP or re.fullmatch(r"[A-Za-z_]\w*=.*", tokens[k], re.S)):
            k -= 1
        if k >= 0 and tokens[k] not in ("&&", "||", ";", "|", "("):
            continue
        j, where = i + 1, None
        while j + 1 < len(tokens) and tokens[j] in ("-c", "-C"):
            if tokens[j] == "-C":
                where = tokens[j + 1]
            j += 2
        if j < len(tokens) and tokens[j] in ("commit", "merge"):
            rest = tokens[j + 1:]
            end = next((k for k, t in enumerate(rest) if t in ("&&", "||", ";", "|")), len(rest))
            return tokens[j], rest[:end], where
    return None, [], None

def read_file(where, value):
    path = value if os.path.isabs(value) else os.path.join(where or cwd, value)
    try:
        return open(path, encoding="utf-8").read()
    except OSError:
        return None

def message(args, where):
    """메시지 본문 (지정이 없으면 None)"""
    if msg_heredoc:
        return msg_heredoc.group(2)
    for k, t in enumerate(args):
        if t.startswith("--message="):
            return t.split("=", 1)[1]
        if t.startswith("--file="):
            return read_file(where, t.split("=", 1)[1])
        is_message = t in ("-m", "--message") or re.fullmatch(r"-[a-zA-Z]*m", t)
        is_file = t in ("-F", "--file") or re.fullmatch(r"-[a-zA-Z]*F", t)
        if (is_message or is_file) and k + 1 < len(args):
            return read_file(where, args[k + 1]) if is_file else args[k + 1]
    return None

sub, args, where = git_args(code)
if sub is None:
    sys.exit(0)
body = message(args, where)
if body is None:
    if sub == "merge" and not NO_MESSAGE_MERGE.intersection(args):
        sys.stderr.write(
            "git merge 는 -m 으로 커밋 규칙 형식의 메시지를 줘야 합니다 (기본 \"Merge branch …\" 메시지는 규칙 위반).\n"
            "예: git merge --no-ff {브랜치} -m \"chore: {묶음} 묶음 합치기 (spec {NNN})\" — docs/CONVENTIONS.md \"### 커밋\".\n")
        sys.exit(2)
    sys.exit(0)
line = next((l.strip() for l in body.splitlines() if l.strip()), "")
if is_valid(line):
    sys.exit(0)
sys.stderr.write(help_message(line))
sys.exit(2)
' "$ROOT"
