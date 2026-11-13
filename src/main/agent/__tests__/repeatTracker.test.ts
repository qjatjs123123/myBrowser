import { describe, expect, it } from 'vitest';

import {
  createRepeatTracker,
  findRepeatedCycle,
  noteAction,
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

  it('5회째에 확인 안내와 shouldAsk 를 낸다 (4회째는 안내만)', () => {
    const tracker = createRepeatTracker();
    noteRepeat(tracker, snapshotOf(SCREEN_A));
    const noteList = Array.from({ length: REPEAT_STOP_THRESHOLD }, () => noteRepeat(tracker, CLICK_17));
    expect(noteList.map((note) => note.shouldAsk)).toEqual([false, false, false, false, true]);
    expect(noteList[3]?.notice).toContain('[반복 4회째] 같은 행동·화면이 반복됩니다');
    expect(noteList[4]?.notice).toContain('[반복 5회째] 같은 행동·화면이 반복돼 사용자에게 확인합니다');
  });
});

describe('동작 묶음 반복 (spec 026 FR-1)', () => {
  const repeat = (cycle: string[], times: number) => Array.from({ length: times }, () => cycle).flat();

  it('A→B→C 가 3번 연달아 나오면 그 묶음을 돌려준다', () => {
    expect(findRepeatedCycle(repeat(['A', 'B', 'C'], 3))).toEqual(['A', 'B', 'C']);
  });

  it('2번만 나오면 null', () => {
    expect(findRepeatedCycle(repeat(['A', 'B', 'C'], 2))).toBeNull();
  });

  it('같은 행동만 6번(주기 1)은 잡지 않는다', () => {
    expect(findRepeatedCycle(repeat(['A'], 6))).toBeNull();
  });

  it('사이에 다른 동작이 끼면 잡지 않는다', () => {
    expect(findRepeatedCycle(['A', 'B', 'A', 'B', 'X', 'A', 'B'])).toBeNull();
  });

  it('길이 8 묶음도 잡는다', () => {
    const cycle = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(findRepeatedCycle(['앞', ...repeat(cycle, 3)])).toEqual(cycle);
  });

  it('noteAction 은 3번째 묶음이 끝나는 순간 묶음을 돌려주고, reset 뒤에는 처음부터 센다', () => {
    const tracker = createRepeatTracker();
    const resultList = repeat(['A', 'B'], 3).map((action) => noteAction(tracker, action));
    expect(resultList.at(-1)).toEqual(['A', 'B']);
    expect(resultList.slice(0, -1).every((result) => result === null)).toBe(true);
    tracker.askedBlockKeySet.add('/p|문구');
    tracker.reset();
    expect(tracker.actionList).toEqual([]);
    expect(tracker.askedBlockKeySet.has('/p|문구')).toBe(true);
    expect(noteAction(tracker, 'A')).toBeNull();
  });
});
