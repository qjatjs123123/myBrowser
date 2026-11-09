import { describe, expect, it } from 'vitest';

import { createRepeatTracker, noteRepeat, REPEAT_THRESHOLD, toRepeatKey, toRepeatNotice } from '../repeatTracker';

const SCREEN_A = 'URL: a / 제목: 달력\n- link "17" [ref=e3]\n- button "적용" [ref=e4]';
const SCREEN_A_RENUMBERED = 'URL: a / 제목: 달력\n- link "17" [ref=f2e9]\n- button "적용" [ref=f2e10]';
const SCREEN_B = 'URL: a / 제목: 달력\n- link "17" [ref=e3]\n- paragraph: 인원 2명';

const snapshotOf = (resultText: string) => ({ tool: 'snapshot', summary: '페이지 읽기', resultText });
const CLICK_17 = { tool: 'click', summary: '‘17’ 클릭', resultText: '클릭함' };

describe('toRepeatKey', () => {
  it('ref 번호만 다른 snapshot 은 같은 key 다', () => {
    const key = (text: string) => toRepeatKey({ ...snapshotOf(text), lastScreenKey: '' });
    expect(key(SCREEN_A)).toBe(key(SCREEN_A_RENUMBERED));
  });

  it('snapshot 이 아니면 도구·요약·직전 화면으로 key 를 만든다', () => {
    expect(toRepeatKey({ ...CLICK_17, lastScreenKey: 'S' })).toBe('click|‘17’ 클릭|S');
  });
});

describe('toRepeatNotice', () => {
  it('기준 미만이면 빈 문자열, 기준부터는 횟수를 담은 안내다', () => {
    expect(toRepeatNotice(REPEAT_THRESHOLD - 1)).toBe('');
    expect(toRepeatNotice(REPEAT_THRESHOLD)).toContain(`[반복 ${REPEAT_THRESHOLD}회째]`);
    expect(toRepeatNotice(4)).toContain('[반복 4회째]');
  });
});

describe('noteRepeat', () => {
  it('같은 화면을 세 번째 보면 안내를 붙인다', () => {
    const tracker = createRepeatTracker();
    expect(noteRepeat(tracker, snapshotOf(SCREEN_A))).toBe('');
    expect(noteRepeat(tracker, snapshotOf(SCREEN_A_RENUMBERED))).toBe('');
    expect(noteRepeat(tracker, snapshotOf(SCREEN_A))).toContain('[반복 3회째]');
  });

  it('같은 화면에서 같은 click 을 세 번째 하면 안내를 붙인다', () => {
    const tracker = createRepeatTracker();
    noteRepeat(tracker, snapshotOf(SCREEN_A));
    expect(noteRepeat(tracker, CLICK_17)).toBe('');
    expect(noteRepeat(tracker, CLICK_17)).toBe('');
    expect(noteRepeat(tracker, CLICK_17)).toContain('[반복 3회째]');
  });

  it('사이에 화면이 바뀐 같은 click 3회는 안내하지 않는다', () => {
    const tracker = createRepeatTracker();
    const resultList = [SCREEN_A, SCREEN_B, 'URL: a / 제목: 달력\n- paragraph: 인원 3명'].map((screen) => {
      noteRepeat(tracker, snapshotOf(screen));
      return noteRepeat(tracker, CLICK_17);
    });
    expect(resultList).toEqual(['', '', '']);
  });
});
