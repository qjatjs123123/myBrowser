import { describe, expect, it } from 'vitest';

import { CUT_ACTIONABLE_MAX_LENGTH, CUT_ACTIONABLE_TITLE, truncateWithActionables } from '../snapshotTruncate';

const MARK = '\n[잘림]';
const lines = (...list: string[]) => list.join('\n');

describe('truncateWithActionables (spec 025 FR-2)', () => {
  it('상한을 넘지 않으면 원문 그대로다', () => {
    expect(truncateWithActionables('- button "A" [ref=e1]', 100, MARK)).toBe('- button "A" [ref=e1]');
  });

  it('잘린 부분의 버튼·링크 줄을 ref 와 함께 제목 아래 싣는다', () => {
    const head = '- heading "날짜 선택" [ref=e1]';
    const text = lines(head, '  - text: 안내', '  - button "선택 완료" [ref=e9] [cursor=pointer]', '  - link "도움말" [ref=e10]');
    expect(truncateWithActionables(text, head.length + 1, MARK)).toBe(
      `${text.slice(0, head.length + 1)}${MARK}\n${CUT_ACTIONABLE_TITLE}\n- button "선택 완료" [ref=e9] [cursor=pointer]\n- link "도움말" [ref=e10]`,
    );
  });

  it('비활성·이름 없는 요소·일반 글은 빼고 같은 줄은 한 번만', () => {
    const text = lines(
      'x'.repeat(10),
      '- button "닫기" [disabled] [ref=e2]',
      '- link [ref=e3]',
      '- paragraph: 안내 문장',
      '- button "확인" [ref=e4]',
      '- button "확인" [ref=e4]',
    );
    expect(truncateWithActionables(text, 5, MARK)).toBe(`${'x'.repeat(5)}${MARK}\n${CUT_ACTIONABLE_TITLE}\n- button "확인" [ref=e4]`);
  });

  it('해당 줄이 없으면 제목 없이 잘림 표시만 붙인다', () => {
    const text = lines('- paragraph: 1', '- paragraph: 2', '- paragraph: 3');
    expect(truncateWithActionables(text, 5, MARK)).toBe(`${text.slice(0, 5)}${MARK}`);
  });

  it('자른 위치가 버튼 줄 한가운데면 그 줄을 원문 그대로 싣는다', () => {
    const text = lines('- heading "레이어" [ref=e1]', '- button "선택 완료" [ref=e9]');
    const cutAt = text.indexOf('완료');
    expect(truncateWithActionables(text, cutAt, MARK)).toBe(
      `${text.slice(0, cutAt)}${MARK}\n${CUT_ACTIONABLE_TITLE}\n- button "선택 완료" [ref=e9]`,
    );
  });

  it('3,000 자를 넘으면 (외 k개) 로 끝낸다', () => {
    const buttonList = Array.from({ length: 200 }, (_, i) => `- button "시간표 ${String(i)} 출발 열차 선택" [ref=e${String(i)}]`);
    const result = truncateWithActionables(lines('- heading "h"', ...buttonList), 3, MARK);
    const list = result.slice(result.indexOf(CUT_ACTIONABLE_TITLE) + CUT_ACTIONABLE_TITLE.length + 1);
    expect(list.length).toBeLessThan(CUT_ACTIONABLE_MAX_LENGTH + 20);
    expect(list).toMatch(/\n- \(외 \d+개\)$/);
  });
});
