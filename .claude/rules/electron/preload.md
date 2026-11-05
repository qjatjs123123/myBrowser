---
description: src/preload/ 작성·수정 시 — contextBridge 로 노출하는 window.api 의 규칙
paths:
  - "src/preload/**"
---

# Preload 규칙

preload 는 **얇은 다리**다. 로직·상태·검증을 두지 않는다 (검증은 main 의 핸들러, 표시는 renderer).

## 형태
```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc/channels';
import type { IApi } from '@shared/ipc/api';

const api: IApi = {
  tabs: {
    list: () => ipcRenderer.invoke(IPC.tabs.list),
    navigate: (req) => ipcRenderer.invoke(IPC.tabs.navigate, req),
    onChanged: (cb) => subscribe(IPC.tabs.changed, cb),
  },
  agent: { … },
};
contextBridge.exposeInMainWorld('api', api);
```
- `IApi` 타입은 `src/shared/ipc/api.ts` 에 정의하고 renderer 의 `window.api` 선언(`src/renderer/env.d.ts`)이 같은 타입을 쓴다 — 양쪽 타입이 어긋날 수 없다.
- 이벤트 구독은 `subscribe(channel, cb)` 헬퍼로 **해제 함수를 반환**한다. renderer 훅이 cleanup 에서 부른다.
- 채널명 문자열을 직접 쓰지 않는다 — `IPC.{모듈}.{동작}` 상수만.

## 금지
- ❌ `ipcRenderer` 자체 또는 `invoke`/`send` 범용 함수를 노출 (renderer 가 아무 채널이나 부를 수 있게 됨)
- ❌ preload 에 zod 검증·상태·캐시·재시도 로직
- ❌ `require`·Node API 를 renderer 에 노출
- ❌ 탭(웹페이지) View 에 이 preload 를 붙이기
