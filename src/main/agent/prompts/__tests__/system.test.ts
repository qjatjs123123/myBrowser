import { describe, expect, it } from 'vitest';

import { buildFirstUserContent, buildFirstUserMessage, buildSystemPrompt, FIRST_SCREENSHOT_NOTE } from '../system';

const WITH_PIXEL = buildSystemPrompt({ hasComputerToolset: true });
const WITHOUT_PIXEL = buildSystemPrompt({ hasComputerToolset: false });
const PROMPT_CASE_LIST = [
  ['픽셀 도구 있음', WITH_PIXEL],
  ['픽셀 도구 없음', WITHOUT_PIXEL],
] as const;

describe('buildSystemPrompt', () => {
  it('픽셀 도구가 있는 프롬프트는 의도치 않게 바뀌지 않는다 (스냅샷)', () => {
    expect(WITH_PIXEL).toMatchSnapshot();
  });

  it('픽셀 도구가 없는 프롬프트는 의도치 않게 바뀌지 않는다 (스냅샷)', () => {
    expect(WITHOUT_PIXEL).toMatchSnapshot();
  });

  describe.each(PROMPT_CASE_LIST)('%s', (_label, prompt) => {
    it.each(['결제', '예약 확정', '주문', '전송', '비밀번호', '카드번호', '추측하지 않는다', 'snapshot'])(
      '“%s” 안전·순서 문구를 담는다',
      (phrase) => {
        expect(prompt).toContain(phrase);
      },
    );

    it.each(['ask_user', 'request_approval', '승인 창', '한국 예약 사이트', '날짜·시간·인원'])(
      '“%s” 승인·질문·예약 문구를 담는다 (spec 004 FR-9)',
      (phrase) => {
        expect(prompt).toContain(phrase);
      },
    );

    it.each(['[적용]', '부분 snapshot 포함', '[반복] 표시'])(
      '“%s” 레이어·ref·반복 문구를 담는다 (spec 015 FR-6)',
      (phrase) => {
        expect(prompt).toContain(phrase);
      },
    );

    it('잘린 snapshot 을 scroll 로 더 읽으라고 하지 않는다', () => {
      expect(prompt).not.toContain('read_text 나 scroll 로 더 읽는다');
    });

    it('섹션 순서는 역할 → 도구 순서 → 안전 → 예약 참고 → 출력이다', () => {
      const indexList = ['# 역할', '# 도구 사용 순서', '# 안전 규칙', '# 한국 예약 사이트 참고', '# 출력 형식'].map(
        (h) => prompt.indexOf(h),
      );
      expect(indexList.every((index, i) => index >= 0 && (i === 0 || index > (indexList[i - 1] ?? 0)))).toBe(true);
    });

    it('날짜를 담지 않는다 (캐시 prefix 유지)', () => {
      expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(prompt).not.toContain('오늘:');
    });
  });

  it.each(['픽셀 도구', '연달아 찍지 않는다', 'screenshot'])('픽셀 도구가 있으면 “%s” 를 담는다', (phrase) => {
    expect(WITH_PIXEL).toContain(phrase);
  });

  it.each(['픽셀 도구', '연달아 찍지 않는다', 'screenshot'])(
    '픽셀 도구가 없으면 “%s” 를 담지 않는다 (spec 015 FR-6)',
    (phrase) => {
      expect(WITHOUT_PIXEL).not.toContain(phrase);
    },
  );
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

describe('buildFirstUserContent (spec 022)', () => {
  it('캡처가 있으면 [이미지, 텍스트+안내] 순서다', () => {
    expect(buildFirstUserContent({ text: '할 일: 찾아줘', screenshotBase64: 'AAAA' })).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      { type: 'text', text: `할 일: 찾아줘\n\n${FIRST_SCREENSHOT_NOTE}` },
    ]);
  });

  it('캡처가 없으면 텍스트 문자열 그대로다', () => {
    expect(buildFirstUserContent({ text: '할 일: 찾아줘', screenshotBase64: null })).toBe('할 일: 찾아줘');
  });
});
