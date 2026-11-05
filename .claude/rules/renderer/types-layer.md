---
description: 공용 타입·상수(src/shared/types/**, src/shared/constants/**, src/renderer/types/**, src/renderer/constants/**) 작성 시
paths:
  - "src/shared/types/**"
  - "src/shared/constants/**"
  - "src/renderer/types/**"
  - "src/renderer/constants/**"
---

# Types · Constants 규칙

- `src/shared/types/{name}Type.ts` — main·renderer 가 같이 쓰는 모델 타입 (`ITabState`, `IRun`, `IStep`, `TRunStatus`). **zod 스키마에서 추론되는 타입은 여기 다시 선언하지 않는다** (`src/shared/ipc/*`·`tools/*` 의 `T{Name}` 을 import).
- `src/renderer/types/` — renderer 만 쓰는 화면 모델. `src/renderer/constants/` — 화면 상수.
- 이름은 `I`/`T` 접두사, `Type` 접미사 금지, 키 camelCase, 배열 `List` 접미사, 날짜는 ISO 문자열(IPC 를 건너므로 `Date` 객체 금지 — renderer 에서 변환).
- 상수는 UPPER_SNAKE_CASE, 상수 객체는 `as const`. 가드 패턴·도구 이름·채널명은 **shared** 에 (양쪽이 같은 값을 봐야 한다).
- 이 계층은 아무 것도 import 하지 않는다 (같은 계층의 constants 만 예외). 폴더는 필요할 때만 만든다.
