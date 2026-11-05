import { describe, expect, it, vi, type Mock } from 'vitest';

import { IPC } from '@shared/ipc/channels';
import { ShortcutPressedEventSchema, type TShortcutPressedEvent } from '@shared/ipc/shortcut';

import { createSidebarEmitter, type IWebContentsLike } from '../emit';

function createFakeWebContents(isDestroyed = false): IWebContentsLike & { send: Mock<IWebContentsLike['send']> } {
  return { send: vi.fn<IWebContentsLike['send']>(), isDestroyed: () => isDestroyed };
}

describe('createSidebarEmitter', () => {
  it('스키마로 parse 한 뒤 채널로 보낸다', () => {
    const webContents = createFakeWebContents();
    const emitToSidebar = createSidebarEmitter(() => webContents);
    emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action: 'focusAddressBar' });
    expect(webContents.send).toHaveBeenCalledWith('shortcut:pressed', { action: 'focusAddressBar' });
  });

  it('스키마를 어기면 throw 하고 보내지 않는다', () => {
    const webContents = createFakeWebContents();
    const emitToSidebar = createSidebarEmitter(() => webContents);
    const invalid = { action: 'unknown' } as unknown as TShortcutPressedEvent;
    expect(() => emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, invalid)).toThrow();
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it('대상 webContents 가 없으면 조용히 무시한다', () => {
    const emitToSidebar = createSidebarEmitter(() => null);
    expect(() =>
      emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action: 'focusAddressBar' }),
    ).not.toThrow();
  });

  it('대상 webContents 가 destroyed 면 보내지 않는다', () => {
    const webContents = createFakeWebContents(true);
    const emitToSidebar = createSidebarEmitter(() => webContents);
    emitToSidebar(IPC.shortcut.pressed, ShortcutPressedEventSchema, { action: 'focusAddressBar' });
    expect(webContents.send).not.toHaveBeenCalled();
  });
});
