---
name: zod-usage
description: Zod 스키마로 검증 코드를 작성·수정할 때 반드시 사용. IPC 요청/응답(src/shared/ipc), 에이전트 도구 입력(src/main/agent/tools), 모델 응답·저장 데이터, 사이드바 폼에서 parse/safeParse 선택 기준과 에러 처리 방식을 정한다.
---

# Zod 사용 규칙 — 어디서 parse, 어디서 safeParse

스키마의 **단일 출처는 `src/shared/`** 다 — main·preload·renderer 가 같은 스키마를 import 한다 (`rules/electron/ipc.md`).

## 1. IPC 경계 (main 의 핸들러) → `safeParse` + 구조화된 에러 반환

- renderer 에서 오는 입력은 신뢰하지 않는다 (preload 를 거쳐도 마찬가지).
- 실패 시 throw 하지 말고 `{ ok: false, error: { code: 'INVALID_INPUT', message, issues } }` 로 돌려준다 — renderer 는 `ok` 로 분기한다.

```ts
// src/main/ipc/handlers/tabs.ts
ipcMain.handle(IPC.tabs.navigate, (_e, raw) => {
  const parsed = NavigateRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', parsed.error);
  return ok(tabManager.navigate(parsed.data));
});
```

## 2. 에이전트 도구 입력 → `safeParse` + `is_error` tool_result

- 모델이 만든 `tool_use.input` 은 외부 입력이다. 스트리밍(`eager_input_streaming`)이면 잘린 JSON 이 올 수 있으므로 **실행 전에 반드시 검증**한다.
- 실패하면 도구를 실행하지 않고 `tool_result` 를 `is_error: true` + 어떤 필드가 왜 틀렸는지(짧게) 돌려준다 — 모델이 고쳐서 다시 부른다.
- `betaZodTool({ inputSchema })` 를 쓰면 SDK 가 검증한다. 수동 루프면 직접 `safeParse`.

```ts
const parsed = ClickInputSchema.safeParse(block.input);
if (!parsed.success) return toolError(block.id, `입력 오류: ${summarizeIssues(parsed.error)}`);
```

## 3. 저장 데이터(SQLite row → 객체), 설정 파일 → `parse` (실패는 버그)

- 우리가 쓴 데이터를 다시 읽는 곳. 깨져 있으면 조용히 넘기지 말고 throw 해서 로그에 남긴다 (`main.error` 로 수집됨).

## 4. 사이드바 폼 → `parse` 스키마 + react-hook-form `zodResolver`

- 위치: `src/renderer/sidebar/{Name}/{name}Validation.ts`. IPC 스키마 재사용 금지 (폼은 사용자 메시지, IPC 는 계약).
- 필드 인라인 메시지(`formState.errors`) + 제출 막힘 toast 1개(`onInvalid`, → `error-toast`).

## 5. 스키마 작성 규칙
- `z.object({...}).strict()` 기본 (알 수 없는 키 거부) — 도구 입력은 모델 실수를 바로 잡기 위해 특히 strict.
- 좌표·인덱스는 `z.number().int().nonnegative()`, URL 은 `z.string().url()`, ref 는 `z.string().regex(/^e\d+$/)` 처럼 **형식까지** 제한.
- 추론 타입은 `T{Name}` (`type TNavigateRequest = z.infer<typeof NavigateRequestSchema>`), 스키마 상수는 `{Name}Schema`.

## 금지
- ❌ IPC 핸들러·도구에서 `parse` 로 throw (프로세스 에러 로그가 오염되고 모델이 고칠 기회가 없다)
- ❌ 검증 없이 `tool_use.input` 을 그대로 실행
- ❌ renderer 에 별도 복제 스키마 (shared 에서 import)
- ❌ `z.any()`·`z.record(z.unknown())` 를 도구 입력에 사용
