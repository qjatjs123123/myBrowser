import { describe, expect, it, vi } from 'vitest';

import { createMainMenuTemplate } from '../mainMenu';

describe('createMainMenuTemplate (spec 023)', () => {
  it('「방문 기록」 항목 하나 — linux 는 CmdOrCtrl+H 를 표시만 한다', () => {
    const template = createMainMenuTemplate({ platform: 'linux', onOpenHistory: vi.fn() });
    expect(template).toHaveLength(1);
    expect(template[0]).toMatchObject({ label: '방문 기록', accelerator: 'CmdOrCtrl+H', registerAccelerator: false });
  });

  it('darwin 은 Cmd+Shift+H 를 표시한다', () => {
    const template = createMainMenuTemplate({ platform: 'darwin', onOpenHistory: vi.fn() });
    expect(template[0]?.accelerator).toBe('Cmd+Shift+H');
  });

  it('누르면 onOpenHistory 를 부른다', () => {
    const onOpenHistory = vi.fn();
    const [item] = createMainMenuTemplate({ platform: 'linux', onOpenHistory });
    const click = item?.click as () => void;
    click();
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});
