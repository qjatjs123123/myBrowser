---
name: vibe-build
description: 기능 요청(추가·수정·버그 수정)을 spec → spec 검증 → 구현(필요하면 워크트리 병렬) → 리팩토링 → 실제 앱 e2e 검증 → 커밋·dev merge 까지 끝내는 하네스. 사용자가 "~ 만들어줘", "~ 추가해줘", "~ 바꿔줘", "~ 안 돼/고쳐줘"처럼 코드 변경이 필요한 요청을 하면 반드시 이 스킬을 따른다.
---

# vibe-build — 요청 하나를 완성까지

모든 단계에서 `.claude/rules/**`와 관련 스킬을 따른다(해당 파일을 만질 때 rules 는 자동 로드된다).
`desktop/spec-create` 같은 표기는 **`.claude/skills/desktop/{이름}/SKILL.md` 를 Read 로 읽고 따른다**는 뜻이다. 슬래시 커맨드가 아니다.

```
0 준비 → 1 요구사항 → 2 spec(desktop/spec-create) → 3 spec 검증(spec-reviewer) + 배치표
→ 4 구현(직접 spec-run | 묶음별 desktop-dev 워크트리 병렬) → 5 합치기
→ 6 리팩토링 → 7 앱 검증(desktop/app-check: 실제 Electron e2e) → 8 최종 검증(harness)
→ 9 검증 반영 커밋 → dev merge → 10 보고
```

## vibe-build 모드 (하위 스킬 공통 규칙)
규칙의 단일 출처는 **`.claude/skills/COMMON.md` §2**. 브랜치 흐름은 `COMMON.md` §3-B.

## 0. 준비
- 개발 환경이 준비 안 됐으면 vibe-setup 을 먼저 따른다. **프로젝트 뼈대(`package.json`)가 아직 없으면** 이번 요청이 곧 뼈대 생성 spec 이다 — `docs/DESIGN.md` §1·§2·§4 의 스택·구조대로 Task 를 짜고(electron-vite 템플릿 기준), 완료 기준은 `make setup && make check && make e2e`(빈 창 뜨는 e2e 1개) 통과.
- `.harness/runs/`에 같은 작업의 진행 중 run(`DONE` 없음)이 있으면 `state.md`부터 읽고 재개한다. `PAUSED` 가 있으면 사용자 답을 반영한 뒤 **지우고** 멈춘 단계부터 이어서 한다.
- **멈춤 표시(`RUN_DIR/PAUSED`)**: 코드를 바꾼 뒤 사용자 답을 기다리며 턴을 끝내야 할 때만 사유 1줄을 적어 만든다 — 종료 품질 게이트가 막지 않고 알리기만 한다. 오류를 피하려고 만드는 것은 금지. 같은 변경으로 PAUSED 종료는 1회만.
- 새 작업이면 kebab-case 슬러그로 `RUN_DIR=.harness/runs/{slug}/`를 만들고 `task.md`에 요청 원문을 적는다.
- **기존 기록 확인**: `spec/README.md` 를 읽고 관련 spec 을 찾아 읽는다. `docs/DESIGN.md` 의 해당 절(도구·가드·상태 머신)도 읽는다 — 설계와 어긋나는 요청이면 1단계에서 확인하고, 바뀌면 DESIGN.md 도 같이 고친다.
- **spec 번호**를 정한다 (`COMMON.md` §4).
- **작업 브랜치 + 개발 방식** (`COMMON.md` §3-B 1번): `git switch dev` → 미커밋 변경 처리 → `git switch -c feature/{NNN}-{slug}`. 그 다음 `git status --porcelain` 이 비어 있고 spec 의 묶음이 2개 이상이면 **워크트리 방식**, 아니면 **직접 방식**. 방식을 `RUN_DIR/state.md` 에 적는다.

## 1. 요구사항 확정
코드를 쓰기 전에 분명하지 않은 것만 최대 3~4개 묻는다:
- 사용자 관점 동작 (사이드바에서 무엇을 입력하면 탭에서 무엇이 일어나는가)
- 에이전트가 **멈춰야 하는 지점**(승인 필요 행동)이 이번 기능에 있는가 — 있으면 가드 패턴에 추가할 문구·URL
- 저장해야 하는 것 (runs/steps 외 새 데이터?)
- 기존 기능과 비슷하게 하면 되나
확정 내용을 3~5줄로 보여주고 "이대로 만들까요?" 확인. 이후로는 끝날 때까지 묻지 않는다(막힌 경우 제외).

## 2. spec
`desktop/spec-create` 를 따른다 (vibe-build 모드) — 입력: 1단계 요구사항 + spec 번호·기능명 + 관련 기존 spec. **모든 요청(작은 수정·버그 포함)은 spec 을 남긴다.**
- IPC 채널을 추가·변경하면 「IPC 계약」 섹션(채널명·요청/응답 zod 스키마)이 계약이다 — renderer 와 main 이 이것만 보고 각자 만든다.
- 에이전트 도구를 추가·변경하면 「도구 계약」 섹션(이름·입력 스키마·반환·가드 대상 여부)을 적는다.

## 3. spec 검증 → 배치표
Agent 도구로 **`spec-reviewer`** 호출 — 입력: spec 절대경로, 요구사항 요약. `FAIL` 이면 고치고 다시(**최대 3회**), `QUESTIONS` 는 사용자에게 묻는다. 결과를 `RUN_DIR/log.md` 에 적는다.
**PASS 후 spec 커밋**: `spec/{NNN}-*.md` + `spec/README.md` 를 명시적 경로로 add → `docs: spec {NNN} {기능명} 작성 (spec {NNN})`.
워크트리 방식이면 Task 의 `묶음` 으로 배치표를 `RUN_DIR/state.md` 에 적는다:
```markdown
| 묶음 | 기반 묶음 | Task | 상태 | 브랜치 | 워크트리 |
|---|---|---|---|---|---|
| 기반 | — | 1 | 대기 | | |
| main-tabs | 기반 | 2~4 | 대기 | | |
| renderer-chrome | 기반 | 5~6 | 대기 | | |
```
상태: `대기` → `진행` → `기반 준비` → `완료` | `실패` → `합침`. 동시 도우미 최대 3개.

## 4. 구현
- **직접 방식**: `desktop/spec-run {NNN}` 을 vibe-build 모드로 이 폴더에서 따른다 (Task 커밋 없음, 구현 + 단위 테스트까지).
- **워크트리 방식**: 시작 가능한 묶음을 빈 자리만큼 한 메시지에서 동시에 **`desktop-dev`** 로 호출 (`isolation: "worktree"`). 프롬프트: 메인 폴더 절대경로, spec 절대경로, 담당 묶음·Task 번호, 기반(브랜치 + 시작 커밋 해시), IPC·도구 계약 섹션 위치. 기반 묶음은 마지막 Task 커밋이 보이는 즉시 위 묶음을 띄운다. 끝난 묶음은 바로 5단계로 merge. 도우미가 돌아가는 동안 커밋 제목을 한 줄씩 사용자에게 알린다.
- 도우미가 "같은 에러 3회 연속 실패"를 보고하면: `docs/TROUBLESHOOTING.md` 에서 증상을 찾아 SendMessage 로 이어 실행(묶음당 재개 1회) → 그래도 실패면 `실패` 로 적고 10단계 실패 보고.

## 5. 합치기 (워크트리 방식만)
기반 묶음부터 `git merge --no-ff {도우미 브랜치} -m "chore: {묶음} 묶음 합치기 (spec {NNN})"` → `git worktree remove --force {경로} && git branch -d {브랜치}`. 충돌이면 `--abort` 후 보고(덮어쓰기 금지). 공유 파일 요청은 여기서 메인이 반영. 전부 합친 뒤 `make check` 1회.

## 6. 리팩토링
`desktop/refactor` 적용 모드 (vibe-build 모드) — 워크트리 방식은 `--spec {NNN} --apply` + 미커밋 변경, 직접 방식은 `--apply`. 수정이 있으면 `pnpm test` 재실행. "사용자 확인 필요" 항목은 10단계 보고에.

## 7. 앱 검증 — 실제 Electron 에서 e2e
UI·에이전트 동작 Task 마다 `desktop/app-check` 를 따른다 — Playwright `_electron.launch` 로 앱을 띄워 흐름을 돌리고 콘솔·main 프로세스 에러 0 확인, 그 흐름을 `e2e/{기능}.spec.ts` 로 고정해 통과. 에이전트 루프가 포함된 흐름은 **Claude API 를 실제로 부르지 않고** `e2e/fixtures` 의 가짜 모델 응답(`MYBROWSER_FAKE_MODEL=1`)으로 돌린다 — 승인 게이트가 멈추는지는 이 모드로 검증한다.

## 8. 최종 검증 루프
`.claude/skills/vibe-build/harness.md` 를 읽고 따른다 — 입력: "{slug} 최종 검증". 통과하면 `RUN_DIR/DONE`. **통과 못 하면 9단계로 가지 않는다.**

## 9. 커밋 → dev merge
`COMMON.md` §3 절차로:
1. spec 상태 `✅ 완료`, Task 체크박스·진행 로그 갱신. 설계가 바뀌었으면 `docs/DESIGN.md` 갱신.
2. 고치는 데 2번 이상 걸린 오류는 `docs/TROUBLESHOOTING.md` 에 항목 추가.
3. **검증 반영 커밋** (작업 브랜치) — 직접 방식은 이번 요청 전체, 워크트리 방식은 메인이 바꾼 파일만. 메시지 `{type}: {요약} (spec {NNN})`.
4. **dev 에 merge** — `git switch dev` 와 merge 는 별도 Bash 호출: `git merge --no-ff feature/{NNN}-{slug} -m "{type}({scope}): {요약} (spec {NNN})"` → `git branch -d`. main 에는 merge 하지 않는다.

> Stop 훅(품질 게이트)은 턴마다 lint·타입·테스트·테스트 누락만 검사하고 e2e 는 돌리지 않는다 — e2e 는 7단계(app-check)·8단계(harness)에서 반드시 직접 돌린다. 8단계 통과 없이 `DONE` 을 만들면 안 된다.

## 10. 보고
```
✅ {기능}을 만들었습니다.
- 확인: `pnpm dev` 로 앱 실행 → {어디서 무엇을 누르는지}
- 동작: {2~4개}
- 아직 안 되는 것 / 결정 필요: {있으면}
- dev 에 반영. main 반영은 직접.
```
실패면: 된 것 / 막힌 것 / 필요한 결정 + "해결되면 '이어서 해줘'" (작업 브랜치에 남아 있고 dev 에는 미반영).

## 금지
- 1단계 확인 없이 코드 작성, spec-reviewer PASS 없이 4단계
- 안전 게이트(`guard.ts`)·승인 흐름을 약화하는 변경을 사용자 확인 없이 진행
- 실제 Claude API 를 e2e·품질 게이트에서 호출 (가짜 모델 모드 사용)
- 8단계 통과 전 dev merge, `main`·`dev` 직접 커밋, 덮어쓰기 merge, `-m` 없는 merge
- `git push`, 테스트 약화
