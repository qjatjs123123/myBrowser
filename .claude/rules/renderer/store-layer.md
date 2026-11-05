---
description: src/renderer/store/ 의 zustand store 작성·수정 시 — renderer 전용 UI 상태만
paths:
  - "src/renderer/store/**"
---

# Store 규칙 (zustand, renderer UI 상태)

**여기에 두는 것**: 여러 컴포넌트가 공유하는 **renderer 만의 UI 상태** — 사이드바 폭·접힘, 타임라인 상세 펼침, 작성 중 작업 입력 초안.
**두지 않는 것**: main 이 단일 출처인 상태(탭 목록, run 상태·단계, 설정) — 훅이 IPC 이벤트로 받는다 (`react-convention.md`).

```
src/renderer/store/use{Target}Store.ts      예: useLayoutStore.ts
```

## 원칙
1. 먼저 로컬 state·합성을 고려하고, 끌어올림으로 안 될 때만 store.
2. store 1개 = 관심사 1개. 상태와 액션을 함께, 액션은 동사(`setSidebarWidth`, `toggleSidebar`). 불변 업데이트.
3. selector 로 구독 (`useLayoutStore((s) => s.sidebarWidth)`). 전체 구독 금지.
4. 액션 안에서 IPC·부수효과 호출 금지. 사이드바 폭처럼 main 이 알아야 하는 값은 **컴포넌트의 effect** 가 `window.api.layout.update` 로 알린다.
5. `persist` 미들웨어는 사이드바 폭·접힘처럼 재실행 후에도 유지할 값에만, `localStorage` 키는 `mybrowser:{store}`.

```ts
interface ILayoutState { sidebarWidth: number; isSidebarOpen: boolean; setSidebarWidth: (w: number) => void; toggleSidebar: () => void }
/** [레이아웃] 사이드바 폭·접힘 — main 의 탭 bounds 계산에 쓰이므로 변경 시 IPC 로 알린다 (컴포넌트 effect) */
export const useLayoutStore = create<ILayoutState>()(persist((set) => ({ … }), { name: 'mybrowser:layout' }));
```

## 테스트
`store/__tests__/use{Target}Store.test.ts` — `getState()` 로 액션 호출 → 상태 검증, `beforeEach` 리셋.

## 금지
- ❌ 탭·run·설정 등 main 상태 복제 ❌ 액션에서 `window.api` 호출 ❌ 전체 구독 ❌ 이유 없는 미들웨어
