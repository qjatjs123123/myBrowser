"""커밋 메시지 첫 줄 형식 검사 — 단일 출처 (docs/CONVENTIONS.md "### 커밋").

- git commit-msg 훅(.githooks/commit-msg): 사람·Claude 구분 없이 모든 커밋 메시지 파일을 검사한다.
- Claude 훅(.claude/hooks/commit-msg-check.sh): 실행 전에 같은 PATTERN 으로 미리 막는다.

사용: python3 scripts/check_commit_msg.py <메시지 파일>
"""

import re
import sys

TYPES = "feat|fix|design|hotfix|style|refactor|comment|docs|test|chore|rename|remove"
PATTERN = re.compile(rf"^(({TYPES})(\([a-z0-9_-]+\))?|!(HOTFIX|BREAKING CHANGE)): \S")
# git 이 스스로 만드는 메시지 — 사람이 되돌리기·자동 정리할 때 쓰므로 허용
GIT_GENERATED = re.compile(r"^(Revert \"|fixup! |squash! |amend! )")


def first_line(text: str) -> str:
    """주석(#)과 빈 줄을 뺀 첫 줄"""
    return next((line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")), "")


def is_valid(line: str) -> bool:
    """커밋 규칙에 맞는 첫 줄인지"""
    return bool(PATTERN.match(line) or GIT_GENERATED.match(line))


def help_message(line: str) -> str:
    """위반 안내 문구"""
    types = TYPES.replace("|", ",")
    return (
        f'커밋 메시지가 커밋 컨벤션에 맞지 않습니다: "{line}"\n'
        'docs/CONVENTIONS.md 의 "### 커밋" 섹션을 읽고 메시지를 다시 작성하세요.\n'
        f"형식: type: subject  (type 은 소문자 {types} 중 하나, "
        "scope 선택 예: feat(post): ..., 특수: !HOTFIX: / !BREAKING CHANGE:)\n"
    )


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("사용: check_commit_msg.py <메시지 파일>\n")
        return 2
    with open(sys.argv[1], encoding="utf-8") as message_file:
        line = first_line(message_file.read())
    if is_valid(line):
        return 0
    sys.stderr.write(help_message(line))
    return 1


if __name__ == "__main__":
    sys.exit(main())
