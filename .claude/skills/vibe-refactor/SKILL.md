---
name: vibe-refactor
description: 기능은 그대로 두고 코드를 정리한다 — 중복 제거, 긴 함수 나누기, 이름 다듬기, 계층 경계 바로잡기. 사용자가 "코드 정리해줘", "리팩토링해줘", "중복 줄여줘", "공통으로 빼줘", "깔끔하게 해줘"라고 하면 반드시 이 스킬을 따른다.
---

# vibe-refactor — 동작은 그대로, 코드만 정리

**동작이 바뀌면 리팩토링이 아니다** — 화면·에이전트 동작이 달라지는 변경은 하지 않는다 (그건 vibe-build).
아래 `desktop/refactor` 표기는 **`.claude/skills/desktop/refactor/SKILL.md` 를 Read 로 읽고 따른다**는 뜻이다.

## 0. 준비
- 개발 환경이 준비 안 됐으면 vibe-setup 을 먼저 따른다.
- 진행 중인 작업(`.harness/runs/` 에 `DONE` 없는 run)이 있으면, 그 작업을 먼저 끝낼지 사용자에게 묻는다.
- **작업 브랜치**: 대상이 정해지면 `COMMON.md` §3-B 1번대로 `dev` 에서 `feature/refactor-{slug}` 를 만든다.

## 1. 대상 정하기

| 사용자 말 | 대상 |
|---|---|
| "방금 만든 거 정리해줘" / 범위 언급 없음 | 커밋 안 된 변경 파일 (없으면 `git log --grep="(spec " -1` 의 spec 번호 → `desktop/refactor --spec {NNN}`) |
| "탭 쪽 정리해줘", "에이전트 도구 정리해줘" | 그 모듈 폴더 — `src/main/tabs/`, `src/main/agent/tools/`, `src/renderer/sidebar/` 등 |
| "전체 다 정리해줘" | `src/` 전체 — 파일이 50개 넘으면 모듈 단위로 나눠 순서대로 진행한다고 알린다 |

정리 전에 `spec/README.md` 색인에서 대상 기능의 spec 을 찾아 읽고 **원래 동작**을 확인한다. `desktop/refactor` 를 **vibe-refactor 모드**(`COMMON.md` §2-B)로 따른다.

## 2. 검토 → 요약
refactor 스킬의 보고서까지 먼저 수행하고 이렇게 요약한다:
```
정리할 거리:
바로 고칠 수 있는 것 (동작 변화 없음): {n}건 — 예: 매직 넘버 상수화, 미사용 import
확인이 필요한 것 (구조가 바뀜): {m}건
 1. 탭 목록·주소창이 같은 탭 상태 구독 코드를 각각 들고 있음 → useTabStore selector 훅 하나로 합칠까요?
```
"확인이 필요한 것"(컴포넌트·훅 추출, 파일 이동, 도구 통합)은 번호로 고르게 한다. 통합 제안에는 "앞으로 갈라질 수 있으면 합치지 않는 게 낫다"는 판단을 한 줄 덧붙인다.

## 3. 적용
1. 자동 수정 항목 → refactor 스킬의 `--apply` 절차대로.
2. 사용자가 고른 구조 변경 → 해당 rules(`.claude/rules/**`)대로.
3. 기존 테스트는 고치지 않는다 — 리팩토링 후에도 **그대로 통과해야** 한다. 옮긴 파일의 import 경로 수정만 허용. 새로 뺀 공용 함수·컴포넌트에는 테스트를 추가한다.
4. **에이전트 안전 게이트(`src/main/agent/guard.ts`)·승인 흐름은 리팩토링 대상에서 제외** — 동작 동등성을 보장하기 어렵다. 필요하면 vibe-build 로.

## 4. 검증
- `make check` 통과 필수. 테스트 약화 금지.
- 화면 구조를 바꿨으면(컴포넌트 추출·이동) `.claude/skills/vibe-build/harness.md` 를 읽고 따른다 — 입력: "{slug} 리팩토링 검증".
- 통과하면 작업 브랜치에서 수정 파일만 **명시적 경로로 `git add`** 후 `refactor: {대상 요약}` 으로 **1회** 커밋 (`COMMON.md` §3).
- 이어서 **dev 에 merge** (`COMMON.md` §3-B 3번 — 전환과 merge 는 별도 Bash 호출): `git switch dev` → `git merge --no-ff feature/refactor-{slug} -m "refactor: {대상 요약}"` → `git branch -d feature/refactor-{slug}`.

## 5. 보고
```
✅ {대상} 정리 완료. 동작은 그대로.
- 정리한 것: {2~4개}
- 남겨 둔 것: {고르지 않은 제안}
- dev 에 반영. main 반영은 직접.
```

## 금지
- 동작이 바뀌는 수정 (vibe-build 로 넘긴다고 알린다)
- 사용자 확인 없이 컴포넌트·훅 추출, 파일 이동, 통합
- 안전 게이트·승인 흐름 변경
- `main`·`dev` 직접 커밋, 검증 전 merge, 테스트 약화, `git push`
