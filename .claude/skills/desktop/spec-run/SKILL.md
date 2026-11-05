---
name: desktop-spec-run
description: spec/NNN-*.md 의 Task 를 테스트 게이트(vitest·e2e)와 함께 순서대로 구현·커밋하고 마지막에 desktop/refactor 를 적용 모드로 실행하는 절차.
---

# desktop/spec-run — spec 문서 실행기 (테스트 게이트)

> 절차 스킬 — 슬래시 커맨드가 아니다. **`.claude/skills/COMMON.md` 를 먼저 읽고** 따른다.

> **vibe-build 모드** — 공통 규칙은 `COMMON.md` §2. 이 스킬만의 차이: 3️⃣ 리팩토링을 하지 않고(6단계), `desktop/app-check` 를 실행하지 않는다(7단계) — Task 는 구현 + vitest(UI 는 렌더링 테스트, 도구는 픽스처 테스트)까지. 상태·체크박스 갱신과 커밋은 §2 대로(워크트리는 보고로 넘김).

`spec/` 의 spec 문서를 읽고 **문서에 적힌 그대로** 미체크 Task 를 순서대로 실행한다. spec 에 없는 작업을 추가하지 않는다. **유일한 추가 단계는 모든 Task 통과 후의 `desktop/refactor` 1회다.**

## 입력
```
desktop/spec-run <spec 파일명 또는 번호>          # 미완료 Task 전부 순차 실행 (기본)
desktop/spec-run <번호> --one                      # 다음 1개만
desktop/spec-run                                   # 진행중 spec 목록 보여주고 선택
```

---

## 실행 절차

### 1️⃣ spec 로드
- spec **전체**를 읽는다 (요구사항·안전 요구사항·IPC/도구 계약·범위 제외 포함).
- **열린 질문이 남아 있으면 멈추고 묻는다.**
- 상태 `📝 계획됨` → `🚧 진행중` (spec + 색인). *(vibe-build 모드 우선)*
- 첫 미체크 Task 를 찾는다. 전부 체크면 3️⃣ 로.

### 2️⃣ Task 실행 — spec 그대로
호출한 쪽이 **묶음**(`COMMON.md` §5)을 지정했으면 그 묶음의 Task 만:
1. **구현**: "작업"·"파일"에 적힌 것만. 파일 경로의 rules(`.claude/rules/{electron,agent,renderer}/*.md`, `rules/architecture.md`)를 먼저 Read 한다. 범위 밖 변경이 필요하면 spec 수정을 먼저 제안.
2. **테스트·검증**: "테스트"의 코드를 작성하고 "실행"·"검증"을 그대로 실행한다.
   - **UI·에이전트 동작 Task 는 `desktop/app-check`** — e2e 통과 없이는 체크·커밋하지 않는다. *(vibe-build 모드 우선)*
   - 에이전트 루프·도구 테스트는 **실제 Claude API 를 호출하지 않는다** — 루프는 모델 클라이언트를 주입받아 가짜 응답으로, 도구는 로컬 HTML 픽스처로.
3. **에러 수정 루프**: 실패 로그를 읽고 원인 수정 → 재실행. 같은 에러 **3회 연속**이면 중단·보고. 증상만 덮는 수정(assertion 완화, skip, 기대값 끼워 맞추기)은 실패로 간주. 고치기 전에 `docs/TROUBLESHOOTING.md` 에서 같은 증상을 찾는다.
4. **Task 마무리**: 체크박스 `[x]` + 진행 로그 → Task 범위 파일만 명시적 경로로 `git add` → spec 의 "커밋" 메시지로 커밋. *(vibe-build 모드 우선)*
5. **다음 Task 로 즉시 이동** (`--one` 이면 종료).

### 3️⃣ 전체 통과 후 — 리팩토링
1. `pnpm test` + e2e 를 한 번 돌려 최종 확인.
2. **`desktop/refactor --spec {NNN} --apply`**.
3. 수정이 있으면 테스트 재실행 후 `refactor: spec {NNN} 리팩토링 (spec {NNN})` 커밋.
4. 상태 `✅ 완료` (spec + 색인) → `chore: spec {NNN} 완료 (spec {NNN})`.

### 4️⃣ 완료 보고
```
## Spec 진행 현황: {spec 파일명}
- 완료: {n} / {총} Tasks
- Task별 결과: 번호 ✅/❌ + 테스트 개수
- 커밋: Task별 {짧은 해시}
- 리팩토링: 자동 적용 {n}건 / 수동 확인 필요 {m}건
```

---

## 금지
- ❌ spec 에 없는 파일·기능·단계 추가
- ❌ 테스트 실패·미실행 상태에서 체크·커밋
- ❌ e2e 없이 UI·에이전트 동작 Task 완료 처리
- ❌ 테스트 약화, 실제 Claude API 호출하는 테스트
- ❌ Task 순서 건너뛰기, 지정 묶음 밖 Task·공유 파일 수정
- ❌ `git add -A`, push
- ❌ 안전 가드(`guard.ts`)를 테스트 통과를 위해 느슨하게 바꾸기
