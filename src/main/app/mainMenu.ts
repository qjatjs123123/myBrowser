import type { MenuItemConstructorOptions } from 'electron';

interface IMainMenuOptions {
  platform: NodeJS.Platform;
  /** 「방문 기록」 — Ctrl+H 와 같은 동작 (spec 023 FR-4) */
  onOpenHistory: () => void;
}

/**
 * [툴바 메뉴] [⋮] 버튼이 띄우는 네이티브 팝업 메뉴 템플릿 (spec 023).
 * 탭 View 가 renderer DOM 위에 그려져 웹 드롭다운이 가려지므로 OS 메뉴를 쓴다.
 * 단축키는 표시만 한다(`registerAccelerator: false`) — 실제 키는 tabs/shortcuts.ts 가 처리한다.
 */
export function createMainMenuTemplate({ platform, onOpenHistory }: IMainMenuOptions): MenuItemConstructorOptions[] {
  return [
    {
      label: '방문 기록',
      // mac 의 Cmd+H 는 OS 의 앱 숨기기라 Cmd+Shift+H (spec 021 FR-6)
      accelerator: platform === 'darwin' ? 'Cmd+Shift+H' : 'CmdOrCtrl+H',
      registerAccelerator: false,
      click: onOpenHistory,
    },
  ];
}
