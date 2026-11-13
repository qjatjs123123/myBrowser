import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';

import { createAppMenuTemplate } from '../menu';

const FORBIDDEN_ROLE_LIST = ['reload', 'forceReload', 'close', 'fileMenu', 'viewMenu', 'windowMenu'];

/** 템플릿 전체(submenu 포함)의 role 을 펼친다 */
function getRoleList(itemList: MenuItemConstructorOptions[]): string[] {
  return itemList.flatMap((item) => {
    const own = item.role ? [item.role] : [];
    const submenu = Array.isArray(item.submenu) ? getRoleList(item.submenu) : [];
    return [...own, ...submenu];
  });
}

describe('createAppMenuTemplate', () => {
  it.each(['linux', 'win32'] as const)('%s 배포 모드면 editMenu 만 둔다', (platform) => {
    expect(getRoleList(createAppMenuTemplate({ platform, isDev: false }))).toEqual(['editMenu']);
  });

  it('darwin 이면 appMenu 와 editMenu 를 둔다', () => {
    expect(getRoleList(createAppMenuTemplate({ platform: 'darwin', isDev: false }))).toEqual(['appMenu', 'editMenu']);
  });

  it('개발 모드면 개발자 도구 토글을 넣는다', () => {
    expect(getRoleList(createAppMenuTemplate({ platform: 'linux', isDev: true }))).toContain('toggleDevTools');
  });

  it.each([
    ['linux', false],
    ['linux', true],
    ['win32', true],
    ['darwin', false],
    ['darwin', true],
  ] as const)('%s(isDev=%s) 에는 탭 단축키와 겹치는 role 이 없다', (platform, isDev) => {
    const roleList = getRoleList(createAppMenuTemplate({ platform, isDev }));
    for (const role of FORBIDDEN_ROLE_LIST) expect(roleList).not.toContain(role);
  });
});
