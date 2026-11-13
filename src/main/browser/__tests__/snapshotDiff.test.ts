import { describe, expect, it } from 'vitest';

import {
  diffScreen,
  formatScreenChange,
  NO_SCREEN_CHANGE_NOTE,
  SCREEN_CHANGE_LINE_MAX,
  toScreenLineList,
} from '../snapshotDiff';

/** innerText 형식 — 보이는 글 줄 */
const BEFORE = ['예약하기', '1명', '2명', '인원을 먼저 선택해주세요.', '14', '15'].join('\n');
const AFTER = [BEFORE, '오후 6:00', '오후 7:00'].join('\n');

describe('toScreenLineList', () => {
  it('첫 줄도 비교에 넣고 앞뒤 공백·빈 줄을 정리한다', () => {
    expect(toScreenLineList('예약하기\n\n  1명  \n\t\n2명')).toEqual(['예약하기', '1명', '2명']);
  });
});

describe('diffScreen·formatScreenChange', () => {
  it('나타난 줄을 보인다', () => {
    expect(formatScreenChange(diffScreen(BEFORE, AFTER))).toBe('\n화면 변화: 나타남 2줄 — 오후 6:00 · 오후 7:00');
  });

  it('사라진 줄을 보인다', () => {
    expect(formatScreenChange(diffScreen(AFTER, BEFORE))).toBe('\n화면 변화: 사라짐 2줄 — 오후 6:00 · 오후 7:00');
  });

  it('글이 같으면 변화 없음 안내다', () => {
    expect(formatScreenChange(diffScreen(BEFORE, `${BEFORE}\n`))).toBe(NO_SCREEN_CHANGE_NOTE);
  });

  it('같은 줄이 늘어나면 늘어난 개수만큼 나타남이다', () => {
    expect(diffScreen('추가', '추가\n추가')).toEqual({ addedList: ['추가'], removedList: [] });
  });

  it('6줄을 넘으면 외 k줄, 긴 줄은 자른다', () => {
    const after = Array.from({ length: 8 }, (_, i) => `시간 ${String(i)}`).join('\n');
    const note = formatScreenChange(diffScreen('', after));
    expect(note).toContain('나타남 8줄 —');
    expect(note).toContain('외 2줄');
    const longNote = formatScreenChange(diffScreen('', '가'.repeat(100)));
    expect(longNote).toContain(`${'가'.repeat(SCREEN_CHANGE_LINE_MAX)}…`);
  });

  it('나타남과 사라짐을 함께 보인다', () => {
    expect(formatScreenChange(diffScreen('A', 'B'))).toBe('\n화면 변화: 나타남 1줄 — B / 사라짐 1줄 — A');
  });
});
