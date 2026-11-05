/** Chromium 커맨드라인 스위치 한 개 — [이름, 값] */
export type TSwitch = [name: string, value: string];

interface ICdpOptions {
  port: number;
  isPackaged: boolean;
  isPortExplicit: boolean;
}

/**
 * [CDP] 원격 디버깅 스위치 계산 — 에이전트가 playwright-core 로 탭에 붙는 통로.
 * 항상 127.0.0.1 에만 열고, 패키징된 앱에서는 MYBROWSER_CDP_PORT 를 명시했을 때만 연다. port 0 은 임의 포트.
 * 규칙: .claude/rules/electron/main.md 「보안 기본값」
 */
export function getCdpSwitches({ port, isPackaged, isPortExplicit }: ICdpOptions): TSwitch[] {
  if (isPackaged && !isPortExplicit) return [];
  return [
    ['remote-debugging-address', '127.0.0.1'],
    ['remote-debugging-port', String(port)],
  ];
}
