---
description: React 컴포넌트·훅(src/renderer/**) 작성 시 — 컴포넌트 폴더 구조(<PascalCase>/index.tsx), chrome·sidebar·ui·shared 구분, IPC 접근은 hooks 로만
paths:
  - "src/renderer/**/*.tsx"
  - "src/renderer/hooks/**"
---

# React 컴포넌트 작성 규칙 (renderer)

기준은 **단일 책임 · 선언적 · 가독성 · 예측가능성 · 응집도 · 결합도**. 화면 모양 기준은 `skills/desktop/design`.

## 선언
- 이름 PascalCase, 컴포넌트 폴더도 PascalCase 이고 본체는 `index.tsx`, 하위 부품은 폴더 안 PascalCase 파일.
- **named export**. `export default` 는 `App.tsx` 만.
- `function` 선언 / `const` 화살표 둘 다 허용. 화살표·`memo`·`forwardRef` 면 `displayName` 지정.
- Props 타입은 `I{Component}Props` (`naming-convention.md`).

## 위치
```
src/renderer/chrome/{BrowserChrome,TabBar,AddressBar,NavButtons,NewTabPage,AgentToggleButton,WindowControls,WindowResizeEdges,SidebarResizer}/index.tsx     상단바·탭 영역
src/renderer/sidebar/{AgentPanel,SidebarHeader,Conversation,Timeline,RunResult,ApprovalPanel,QuestionCard,ChoiceList,AccountCard,AppInfoFooter,RunHistory,Settings}/index.tsx     에이전트 패널
src/renderer/components/ui/*.tsx            shadcn (CLI 생성, 규칙 예외 — 평평한 kebab 파일)
src/renderer/components/shared/<Name>/      chrome·sidebar 둘 다 쓰는 복합 부품 (필요할 때만)
```
- 컴포넌트 전용 하위 부품·훅·타입·`__tests__/` 는 같은 폴더에 (응집도). `index.tsx` 는 배럴이 아니라 본체.
- `components/ui/`·`shared/` 는 `chrome/`·`sidebar/` 를 import 하지 않는다.

## main 과의 통신 — hooks 로만
- 컴포넌트는 `window.api` 를 직접 부르지 않는다. `src/renderer/hooks/use{X}.ts` 가 호출·구독을 감싼다:
  ```ts
  /** 탭 목록 — main 이 단일 출처, tabs:changed 로 갱신 */
  export function useTabs() {
    const [tabList, setTabList] = useState<ITabState[]>([]);
    useEffect(() => window.api.tabs.onChanged(setTabList), []); // 해제 함수 반환
    return { tabList, navigate: window.api.tabs.navigate };
  }
  ```
- **main 의 상태를 zustand 에 복제하지 않는다.** 훅 state 로 들고, 여러 컴포넌트가 같이 쓰면 Context 또는 상위에서 한 번 구독해 props 로.
- IPC 결과의 `ok: false` 는 훅이 throw 하지 말고 반환 → 컴포넌트가 toast (`skills/desktop/error-toast`).

## UI 라이브러리 — shadcn/ui
- 버튼·입력·다이얼로그·툴팁·스켈레톤은 직접 만들지 않는다. `window.confirm` 대신 `AlertDialog`.
- 색은 토큰·shadcn 변수 클래스만. 클래스 병합은 `cn()`. 아이콘은 lucide-react.
- 스타일은 Tailwind 클래스만 (CSS 파일·inline style 금지, `globals.css` 는 토큰). **유일한 예외**: 실행 중 정해지는 사이드바 폭 — `<aside style={{ '--sidebar-width': `${width}px` }}>` 로 토큰 변수만 덮어쓴다 (spec 012).

## 핵심 원칙
1. **단일 책임** — "무엇을 하는가"를 한 문장으로. 페칭(IPC)·로직·렌더링이 섞이면 훅으로 분리.
2. **길이** — 책임 한 문장 기준, 참고치 150줄. JSX 중첩 3~4단계+ 면 추출.
3. **선언적** — 명령형 DOM 조작 금지. 중첩 삼항은 변수·컴포넌트로.
4. **State 최소화** — 파생값은 렌더 중 계산, `useState`+`useEffect` 동기화 금지, prop 으로 리셋은 `key`.
5. **Effect 절제** — 외부 시스템 동기화(IPC 구독, 타이머, ResizeObserver)에만. 1 effect = 1 동기화, cleanup 필수, 의존성 정직하게.
6. **예측 가능성** — 같은 이름은 같은 동작, 같은 류 훅은 같은 반환 모양, 숨은 부수효과 금지.
7. **가독성** — early return, 복잡 조건은 이름 있는 변수, 매직 값은 상수, props→상태→핸들러→렌더 순.
8. **응집도** — 함께 바뀌는 것은 같은 폴더.
9. **결합도** — 갈라질 수 있는 중복은 합치지 않는다. Props drilling 은 합성(`children`) → Context 순.
10. **접근성** — 시맨틱 태그, `<label htmlFor>`, 키보드 동작, `div` 위젯엔 `role`+`aria-*`. 승인 모달은 `role="alertdialog"`.
11. **성능은 측정 후** — `memo`/`useMemo`/`useCallback` 기본 사용 금지. 타임라인이 수백 스텝을 넘을 때만 가상화 검토.

## 패턴
- **표시 컴포넌트 + 훅**: `StepTimeline` 은 `stepList` props 만 받고, `useAgentRun` 이 구독·상태를 든다.
- **Extract Component**: `map` 내부 아이템은 별도 컴포넌트(`StepTimeline/StepRow.tsx`).
- **Slot Props**: 레이아웃성 컴포넌트는 `header`·`footer` ReactNode props.
- **Compound**: 탭 바처럼 맥락을 공유하는 하위 요소.
- HOC 신규 작성 금지. 검증 있는 폼은 react-hook-form + zod (`skills/desktop/zod-usage`).

## 테스트
- `__tests__/{Name}.test.tsx`, Testing Library, `getByRole` 우선. `window.api` 는 setup 의 mock. 승인 모달은 "기본 포커스가 거부 버튼" 테스트 포함.

## 안티패턴
- God Component, 컴포넌트 안 컴포넌트 정의, `key={index}`, `useEffect` 로 파생값, `window.api` 를 컴포넌트에서 직접, main 상태를 zustand 에 복제, `electron`/`node:*` import, 색 하드코딩.
