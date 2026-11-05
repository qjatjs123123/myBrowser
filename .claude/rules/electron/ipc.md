---
description: IPC 채널·스키마(src/shared/ipc/**)와 main 핸들러(src/main/ipc/**) 작성·수정 시 — 채널명, 요청/응답 봉투, 이벤트, 테스트 전용 채널
paths:
  - "src/shared/**"
  - "src/main/ipc/**"
---

# IPC 규칙 — renderer ↔ main 계약

계약의 단일 출처는 **`src/shared/ipc/`**. spec 의 「IPC 계약」 섹션이 여기로 옮겨진다.

## 채널명
```ts
// src/shared/ipc/channels.ts
export const IPC = {
  tabs:  { list: 'tabs:list', navigate: 'tabs:navigate', changed: 'tabs:changed' },
  agent: { start: 'agent:start', approve: 'agent:approve', answer: 'agent:answer', stop: 'agent:stop', event: 'agent:event' },
  test:  { getTabState: 'test:getTabState' },
} as const;
```
- 형식 `{모듈}:{동작}`, 동작은 camelCase 동사. renderer→main 요청은 `invoke`(요청/응답), main→renderer 알림은 `{모듈}:{과거분사|event}` 로 `webContents.send`.

## 봉투 — 모든 invoke 응답은 같은 모양
```ts
type TIpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: TIpcErrorCode; message: string; issues?: unknown } };
```
- `code`: `INVALID_INPUT` | `NOT_FOUND` | `BUSY` | `AGENT_ERROR` | `INTERNAL`. `message` 는 **한국어 사용자용 문장** (renderer 가 그대로 toast).
- 핸들러는 throw 하지 않는다 — 예외는 `fail('INTERNAL', …)` 로 감싸고 `[main.error]` 로 로그.

## 스키마
- 채널마다 `{Name}RequestSchema` / `{Name}ResponseSchema` (zod, `.strict()`), 이벤트는 `{Name}EventSchema`. 파일은 `src/shared/ipc/{모듈}.ts`.
- 추론 타입 `T{Name}Request` 등. renderer·main 모두 **이 타입만** 쓴다.
- 핸들러는 `safeParse` → 실패면 `INVALID_INPUT` (`skills/desktop/zod-usage`). main→renderer 이벤트도 보내기 전에 `parse` (우리 버그 조기 발견).

## 핸들러 (src/main/ipc/)
- `registry.ts` 가 `registerAll({ tabs, agent, … })` 로 채널 ↔ 핸들러를 한 곳에서 등록한다 — 새 채널은 여기에 한 줄 추가 (공유 파일, `COMMON.md` §5).
- `handlers/{모듈}.ts` 의 핸들러는 **검증 → 모듈 함수 호출 → 봉투** 3줄 구조. 로직은 모듈에.
- 이벤트 발신은 `src/main/ipc/emit.ts` 의 `emitToSidebar(channel, payload)` 로만 (사이드바 webContents 를 찾아 보낸다).

## 에이전트 이벤트 (`agent:event`)
- 한 채널, discriminated union: `{ type: 'status', status }` | `{ type: 'step', step }` | `{ type: 'approval_required', request }` | `{ type: 'question', question }` | `{ type: 'done', summary }` | `{ type: 'failed', reason }`. renderer 는 `type` 으로 분기.
- step 에는 **사람 말 요약**(`summary: '예약 페이지 열기'`)을 main 이 만들어 넣는다 — renderer 가 도구 JSON 을 해석하지 않는다.

## 테스트 전용 채널 (`test:*`)
- `MYBROWSER_FAKE_MODEL=1` 또는 `NODE_ENV=test` 에서만 등록. 탭의 URL·제목·접근성 스냅샷·픽스처 페이지의 `window.__clickLog` 를 e2e 가 읽을 수 있게 한다. 프로덕션 빌드에서는 등록 코드가 실행되지 않는다 (`env.isTest` 가드).

## 테스트
- 스키마: `src/shared/ipc/__tests__/{모듈}.test.ts` — 유효/무효 입력 각 1개 이상.
- 핸들러: `src/main/ipc/__tests__/{모듈}.test.ts` — 모듈을 가짜로 주입해 봉투 모양·INVALID_INPUT 경로 검증.

## 금지
- ❌ 채널명 문자열 하드코딩, `ipcMain.on` + `event.reply` 식 요청/응답 (invoke 만)
- ❌ 검증 없는 핸들러, throw 하는 핸들러
- ❌ renderer 에 도구 호출 원문을 해석시키기 (요약은 main 책임)
- ❌ `test:*` 채널을 프로덕션에서 등록
