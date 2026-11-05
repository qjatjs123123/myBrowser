# 코딩 규칙 — 공통

기계로 검사할 수 있는 규칙은 ESLint·tsc·테스트가 강제한다. 여기에는 **린터가 못 잡는 것**만 적는다.
계층·프로세스별 상세 규칙의 단일 출처는 `.claude/rules/**` — 이 문서와 다르면 rules 가 우선한다.

## 공통
- 사용자에게 보이는 문구(버튼, 안내, 에러 `message`, 도구 결과 `summary`)는 **한국어**. 코드 이름은 영어.
- 한 개념 = 한 이름. main 의 `run` 을 renderer 에서 `task` 라 부르지 않는다.
- 주석은 "왜". 함수 15줄 이내 + 단일 책임.
- 프로세스 경계(main/preload/renderer/shared)를 넘는 데이터는 **직렬화 가능**해야 한다 (Date·클래스 인스턴스 금지, ISO 문자열·plain object).

## 테스트
- 모든 Task 는 테스트를 포함한다. 실패 상태로 다음 Task 금지. 약화 금지(skip·assertion 삭제·기대값 끼워 맞추기).
- 실제 Claude API·외부 사이트·사용자 프로필을 쓰지 않는다 (`.claude/rules/test-convention.md`).
- 코드 변경 후 `make check` 통과 (종료 시 품질 게이트가 강제).

## 문서
- 모든 개발 요청은 `spec/{NNN}-{기능}.md` 를 남긴다 (색인 `spec/README.md`). 기능이 바뀌면 코드보다 spec 을 먼저 고친다.
- 설계가 바뀌면 `docs/DESIGN.md` 를 같은 커밋에서 고친다.
- 새 에러를 해결하면 `docs/TROUBLESHOOTING.md` 에 추가한다.

## Git (GitHub Flow)

### 브랜치
- `main`: 항상 배포 가능. 직접 작업하지 않는다. `dev → main` 은 사람이.
- `dev`: 개발 기준. 직접 커밋하지 않고 작업 브랜치는 여기서 만든다 (`make setup` 이 `main`·`dev` 생성).
- 작업 브랜치: `feature/{NNN}-{slug}`, 긴급 `hotfix/{NNN}-{slug}`, 정리 `feature/refactor-{slug}`.
- 하네스는 PR 대신 **모든 검증 통과 후 dev 에 `--no-ff` 자동 merge**. `main`·`dev` 위의 커밋은 `.claude/hooks/git-guard.sh` 가 막는다 (절차: `.claude/skills/COMMON.md` §3-B).

### 커밋
커밋 직전 `.claude/hooks/commit-msg-check.sh` 가 첫 줄 형식을 검사한다 (단일 출처 `scripts/check_commit_msg.py`).

```
type(scope): subject

body (선택)
```
- `type` 소문자, scope 선택 (`feat(agent): 승인 게이트 추가`). `subject` 는 한국어 "무엇을 왜" 한 줄, 마침표 없음.
- vibe-build 흐름의 커밋은 첫 줄 끝에 `(spec {NNN})`.

| type | 용도 |
|---|---|
| `feat` | 새 기능 |
| `fix` | 버그 수정 |
| `design` | UI 디자인 변경 |
| `hotfix` | 급한 치명적 버그 |
| `style` | 포맷 등 코드 의미 변화 없음 |
| `refactor` | 프로덕션 코드 리팩토링 |
| `comment` | 주석 추가·변경 |
| `docs` | 문서 |
| `test` | 테스트 코드만 |
| `chore` | 빌드·패키지·설정 |
| `rename` | 파일·폴더 이름/위치만 |
| `remove` | 파일 삭제만 |
| `!BREAKING CHANGE` / `!HOTFIX` | 큰 변경 / 긴급 수정 (`!HOTFIX: 로그인 불가 수정`) |

- 명시적 경로로만 `git add` (`git add -A` 금지).

**민감 정보 커밋 금지** — `.githooks/pre-commit` → `scripts/check_secrets.py` 가 스테이징 파일을 검사한다 (`.env*`, 키 파일, API 키 문자열, `*.db`). CI 도 전체 파일에 돌린다. 걸리면 `git restore --staged` 후 값은 `.env` 로. 오탐은 줄 끝 `secret-scan: allow`. `git add -f`, `--no-verify`, `core.hooksPath` 변경은 Claude 훅이 차단.

### 금지
- Claude 는 `git push` 하지 않는다 (settings 차단). `git reset --hard`, `push --force` 금지.
- `.env` 읽기·출력 금지 — 예시는 `.env.example`.
