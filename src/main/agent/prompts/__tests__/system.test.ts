import { describe, expect, it } from 'vitest';

import { buildFirstUserMessage, SYSTEM_PROMPT } from '../system';

describe('SYSTEM_PROMPT', () => {
  it('의도치 않게 바뀌지 않는다 (스냅샷)', () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });

  it.each(['결제', '예약 확정', '주문', '전송', '비밀번호', '카드번호', '추측하지 않는다', 'snapshot'])(
    '“%s” 안전·순서 문구를 담는다',
    (phrase) => {
      expect(SYSTEM_PROMPT).toContain(phrase);
    },
  );

  it('날짜를 담지 않는다 (캐시 prefix 유지)', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT).not.toContain('오늘:');
  });
});

describe('buildFirstUserMessage', () => {
  it('오늘 날짜(요일)·현재 탭·할 일 순서로 만든다', () => {
    const message = buildFirstUserMessage({
      today: new Date(2026, 10, 5, 9, 0),
      pageUrl: 'https://example.com/',
      pageTitle: '예시',
      task: '전화번호 찾아줘',
    });
    expect(message).toBe('오늘: 2026-11-05 (목)\n현재 탭: https://example.com/ — 예시\n\n할 일: 전화번호 찾아줘');
  });
});
