# Architecture

```
┌ Electron main ───────────────────────────────────────────────┐
│ app/(창·메뉴·프로필)  tabs/(WebContentsView)  browser/(CDP·snapshot·actions)│
│ agent/(toolRunner 루프 · tools/ · guard · prompts · fake)  store/(sqlite) │
│ ipc/(registry · handlers — safeParse → 모듈 → {ok,data}|{ok:false,error})  │
└──────▲──────────────────────────────▲────────────────────────┘
   preload(window.api)            CDP 127.0.0.1:9222
       │                              │
┌ renderer (React) ──────┐  ┌ 탭 WebContentsView ───────┐
│ chrome/ (탭·주소창)      │  │ 실제 웹페이지 + 커서 오버레이  │
│ sidebar/ (입력·타임라인· │  └───────────────────────────┘
│   승인/질문 모달)        │
└────────────────────────┘
```

- **계약**: renderer ↔ main 은 `src/shared/ipc/` 의 zod 스키마가 단일 출처 (`.claude/rules/electron/ipc.md`). 에이전트 도구 입력은 `src/shared/tools/`.
- **에이전트**: SDK toolRunner 가 루프를 돌리고, 턴별 훅에서 `guard.check` → 승인 필요 행동은 `waiting_user` 로 멈춰 사이드바 모달. 상태 머신 `queued → running → waiting_user → … → stopped_before_confirm | done | failed`.
- **상태의 단일 출처는 main** — 탭 목록·run·단계는 main 이 `tabs:changed`·`agent:event` 로 밀어주고 renderer 는 표시만.
- **테스트**: 모델은 가짜(`MYBROWSER_FAKE_MODEL=1`), 페이지는 `e2e/fixtures/pages/*.html`, 프로필은 임시 폴더. 실제 API·외부 사이트 금지.

상세: [docs/DESIGN.md](docs/DESIGN.md) · [.claude/rules/architecture.md](.claude/rules/architecture.md)
