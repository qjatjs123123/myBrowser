import { describe, expect, it } from 'vitest';

import {
  createRepeatTracker,
  noteRepeat,
  REPEAT_STOP_THRESHOLD,
  REPEAT_THRESHOLD,
  toRepeatKey,
  toRepeatNotice,
} from '../repeatTracker';

const SCREEN_A = 'URL: a / 제목: 달력\n- link "17" [ref=e3]\n- button "적용" [ref=e4]';
const SCREEN_A_RENUMBERED = 'URL: a / 제목: 달력\n- link "17" [ref=f2e9]\n- button "적용" [ref=f2e10]';
const SCREEN_B = 'URL: a / 제목: 달력\n- link "17" [ref=e3]\n- paragraph: 인원 2명';

const snapshotOf = (resultText: string) => ({ tool: 'snapshot', summary: '페이지 읽기', resultText });
const CLICK_17 = { tool: 'click', summary: '‘17’ 클릭', resultText: '클릭함' };
/** noteRepeat 결과의 안내만 */
const noticeOf = (...args: Parameters<typeof noteRepeat>) => noteRepeat(...args).notice;

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
    expect(noticeOf(tracker, snapshotOf(SCREEN_A))).toBe('');
    expect(noticeOf(tracker, snapshotOf(SCREEN_A_RENUMBERED))).toBe('');
    expect(noticeOf(tracker, snapshotOf(SCREEN_A))).toContain('[반복 3회째]');
  });

  it('같은 화면에서 같은 click 을 세 번째 하면 안내를 붙인다', () => {
    const tracker = createRepeatTracker();
    noteRepeat(tracker, snapshotOf(SCREEN_A));
    expect(noticeOf(tracker, CLICK_17)).toBe('');
    expect(noticeOf(tracker, CLICK_17)).toBe('');
    expect(noticeOf(tracker, CLICK_17)).toContain('[반복 3회째]');
  });

  it('사이에 화면이 바뀐 같은 click 3회는 안내하지 않는다', () => {
    const tracker = createRepeatTracker();
    const resultList = [SCREEN_A, SCREEN_B, 'URL: a / 제목: 달력\n- paragraph: 인원 3명'].map((screen) => {
      noteRepeat(tracker, snapshotOf(screen));
      return noticeOf(tracker, CLICK_17);
    });
    expect(resultList).toEqual(['', '', '']);
  });
});

describe('포커스·커서 표시와 5회째 중단 (spec 024)', () => {
  it('[active]·[cursor=pointer] 만 다른 snapshot 은 같은 key 다', () => {
    const key = (text: string) => toRepeatKey({ ...snapshotOf(text), lastScreenKey: '' });
    const focused = 'URL: a / 제목: 예약\n- button "2명" [active] [ref=e1] [cursor=pointer]\n- generic [ref=e2] [cursor=pointer]: "15"';
    const moved = 'URL: a / 제목: 예약\n- button "2명" [ref=e1] [cursor=pointer]\n- generic [active] [ref=e2]: "15"';
    expect(key(focused)).toBe(key(moved));
  });

  it('5회째에 멈춤 안내와 shouldStop 을 낸다 (4회째는 안내만)', () => {
    const tracker = createRepeatTracker();
    noteRepeat(tracker, snapshotOf(SCREEN_A));
    const noteList = Array.from({ length: REPEAT_STOP_THRESHOLD }, () => noteRepeat(tracker, CLICK_17));
    expect(noteList.map((note) => note.shouldStop)).toEqual([false, false, false, false, true]);
    expect(noteList[3]?.notice).toContain('[반복 4회째] 같은 행동·화면이 반복됩니다');
    expect(noteList[4]?.notice).toContain('[반복 5회째] 같은 행동·화면이 반복돼 실행을 멈춥니다');
  });
});
