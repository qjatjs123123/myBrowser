---
name: error-toast
description: 사이드바에서 에러·안내를 toast 로 보여주는 코드를 작성할 때 사용. main 이 내려준 메시지 vs renderer 정의 메시지 선택 기준과 노출 위치를 정한다.
---

# 에러 → Toast 표시 규칙 (사이드바)

Toast 는 **`sonner`** 를 쓰고, 호출은 반드시 `@/lib/toast` 의 `toast` 래퍼를 거친다 (`src/renderer/lib/toast.ts`). `<Toaster />` 는 `src/renderer/main.tsx` 에 1회.

```ts
import { toast } from '@/lib/toast';
import { toUserMessage } from '@/utils/errors';
```

## 메시지 선택 기준

| 에러 출처 | 보여줄 메시지 |
|---|---|
| **IPC 응답이 `{ ok: false, error: { code, message } }`** | main 이 만든 `message` **그대로** (한국어, 이미 사용자용) |
| **renderer 자체 에러** (스키마 불일치, IPC 타임아웃, 코드 버그) | `toUserMessage(error)` 의 renderer 정의 메시지 |
| **에이전트 run 실패 이벤트** (`agent:event` 의 `type: 'failed'`) | 이벤트의 `reason` 을 그대로 + "다시 시도" 액션 |

```ts
// src/renderer/utils/errors.ts
export function toUserMessage(error: unknown): string {
  if (error instanceof IpcError && error.message) return error.message;
  if (error instanceof IpcTimeoutError) return '앱 내부 응답이 없습니다. 다시 시도해 주세요';
  return '알 수 없는 오류가 발생했습니다';
}
```

## 노출 위치 규칙
1. **toast 호출은 컴포넌트(호출부)에서만** — 훅·store·IPC 래퍼 내부 금지. 훅은 결과를 반환하고 컴포넌트가 표시한다.
2. **폼 검증 에러는 react-hook-form 인라인 + 요약 toast 1개** (`zod-usage`).
3. **에이전트 진행 중 상태(도구 호출·생각 중)는 toast 가 아니라 단계 타임라인**(`sidebar/StepTimeline`)에 표시한다. toast 는 사용자가 **지금 행동해야 하는 것**(승인 필요, 실패, 질문)에만.
4. **승인 요청·질문은 toast 가 아니라 모달**(`ApprovalModal`·`AskUserModal`) — 놓치면 안 되는 결정이다.

## 금지
- ❌ `sonner` 를 `lib/toast` 래퍼 없이 직접 import
- ❌ 훅·store·IPC 래퍼에서 toast 호출
- ❌ 에러 객체의 영문 스택·원문을 그대로 표시
- ❌ 승인 요청을 toast 로 처리
