---
name: vibe-setup
description: 개발 환경 최초 준비 — 도구 점검, .env 생성, 의존성 설치, Playwright 브라우저, main·dev 브랜치. 훅이 "개발 환경이 준비되지 않았다"고 알리거나 사용자가 설치·준비·처음 시작을 말할 때 사용.
---

# vibe-setup — 개발 환경 준비

## 절차

1. `make doctor` 실행.
   - 실패하면 출력의 "없음" 항목을 **설치 방법과 함께 그대로** 안내하고 멈춘다. 시스템 도구 설치(sudo·GUI)는 사용자가 한다.
   - WSL 에서 Electron 창을 띄우려면 WSLg(`$DISPLAY`)가 있어야 한다 — 없으면 "창 없이(xvfb) 테스트만 가능" 이라고 알린다.
2. **프로젝트 뼈대가 없으면**(`package.json` 없음) 멈추고 알린다 — 뼈대 생성은 vibe-build 의 첫 spec(로드맵 0단계, `docs/DESIGN.md` §5)으로 진행한다. 뼈대 생성 spec 은 `make setup` 이 통과하는 상태(`pnpm lint`·`type-check`·`test`·`test:e2e` 스크립트 존재)를 완료 기준으로 둔다.
3. `make setup` 실행 (수 분 걸릴 수 있음을 먼저 알린다).
   - 실패하면 에러를 읽고 원인을 한 줄로 설명한다. 네이티브 모듈(`better-sqlite3`) 빌드 실패면 `pnpm rebuild` / `electron-rebuild` 를 먼저 시도하고, 그래도 안 되면 `docs/TROUBLESHOOTING.md` 를 본다.
   - `make setup` 은 `main`(배포용)·`dev`(개발 기준) 브랜치도 만들고 dev 로 옮겨 둔다. 이후 코드를 바꾸는 작업은 모두 dev 에서 작업 브랜치를 만들어 한다 (`.claude/skills/COMMON.md` §3-B).
4. `.env` 에 `ANTHROPIC_API_KEY` 가 필요하다 — Claude 는 `.env` 를 읽거나 고칠 수 없으므로 사용자에게 `.env.example` 을 참고해 직접 채우라고 안내한다 (값을 대화에 붙여넣지 말라고 덧붙인다).
5. 성공하면 "준비 끝. 이제 만들 기능을 말해 달라"로 마무리하고, 원래 요청이 있었다면 이어서 처리한다.

## 금지
- `.env` 내용을 읽거나 출력하지 않는다 (`.env.example` 만 참고).
- 시스템 패키지 설치(sudo) 명령을 직접 실행하지 않는다.
