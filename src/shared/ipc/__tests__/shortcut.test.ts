import { describe, expect, it } from 'vitest';

import { ShortcutPressedEventSchema } from '../shortcut';

describe('ShortcutPressedEventSchema', () => {
  it('focusAddressBar·focusNewTabSearch 면 통과한다', () => {
    expect(ShortcutPressedEventSchema.safeParse({ action: 'focusAddressBar' }).success).toBe(true);
    expect(ShortcutPressedEventSchema.safeParse({ action: 'focusNewTabSearch' }).success).toBe(true);
  });

  it('toggleSidebar 면 통과한다', () => {
    expect(ShortcutPressedEventSchema.safeParse({ action: 'toggleSidebar' }).success).toBe(true);
  });

  it('알 수 없는 action 이면 실패한다', () => {
    expect(ShortcutPressedEventSchema.safeParse({ action: 'newTab' }).success).toBe(false);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(ShortcutPressedEventSchema.safeParse({ action: 'focusAddressBar', extra: 1 }).success).toBe(false);
  });

  it('찾기·북마크·기록 검색 동작이면 통과한다 (spec 021)', () => {
    for (const action of ['openFindBar', 'toggleBookmark', 'focusHistorySearch']) {
      expect(ShortcutPressedEventSchema.safeParse({ action }).success).toBe(true);
    }
  });
});
