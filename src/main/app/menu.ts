import type { MenuItemConstructorOptions } from 'electron';

interface IAppMenuOptions {
  platform: NodeJS.Platform;
  isDev: boolean;
}

/**
 * [앱 메뉴] 편집 단축키(복사·붙여넣기·실행 취소)만 남기는 메뉴 템플릿 — 막대는 window.ts 에서 숨긴다.
 * 기본 메뉴의 reload(Ctrl+R)·close(Ctrl+W)가 탭 단축키와 겹치지 않도록 file/view/window 메뉴와 해당 role 은 넣지 않는다.
 * 설계: spec 002 「기본 메뉴 막대 숨김」
 */
export function createAppMenuTemplate({ platform, isDev }: IAppMenuOptions): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  if (platform === 'darwin') template.push({ role: 'appMenu' });
  template.push({ role: 'editMenu' });
  if (isDev) template.push({ label: '개발', submenu: [{ role: 'toggleDevTools' }] });
  return template;
}
