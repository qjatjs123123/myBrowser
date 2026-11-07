import { describe, expect, it } from 'vitest';

import { compactSnapshot, OPEN_DIALOG_MARK } from '../snapshotCompact';

const lines = (...list: string[]) => list.join('\n');

describe('compactSnapshot — 잡음 줄', () => {
  it('/url: "#none"·javascript: 줄은 지우고 실제 주소는 남긴다', () => {
    const tree = lines(
      '- link "달력" [ref=e3] [cursor=pointer]:',
      '  - /url: "#none"',
      '- link "도움말" [ref=e4] [cursor=pointer]:',
      '  - /url: javascript:void(0)',
      '- link "예매 안내" [ref=e5] [cursor=pointer]:',
      '  - /url: https://example.com/guide',
    );
    expect(compactSnapshot(tree)).toBe(
      lines(
        '- link "달력" [ref=e3] [cursor=pointer]',
        '- link "도움말" [ref=e4] [cursor=pointer]',
        '- link "예매 안내" [ref=e5] [cursor=pointer]:',
        '  - /url: https://example.com/guide',
      ),
    );
  });
});

describe('compactSnapshot — 빈 껍데기 접기', () => {
  it('ref 만 있는 generic·cell 이 자식 하나면 그 줄을 빼고 자식을 올린다', () => {
    const tree = lines(
      '- row [ref=e1]:',
      '  - cell [ref=e2]:',
      '    - link "17" [ref=e3] [cursor=pointer]',
      '  - generic [ref=e4]:',
      '    - generic [ref=e5]:',
      '      - button "적용" [ref=e6]',
    );
    expect(compactSnapshot(tree)).toBe(
      lines('- row [ref=e1]:', '  - link "17" [ref=e3] [cursor=pointer]', '  - button "적용" [ref=e6]'),
    );
  });

  it('자식이 둘이거나 속성(pointer)이 있으면 접지 않는다', () => {
    const tree = lines(
      '- generic [ref=e1]:',
      '  - button "A" [ref=e2]',
      '  - button "B" [ref=e3]',
      '- generic [ref=e4] [cursor=pointer]:',
      '  - text: 왕복',
    );
    expect(compactSnapshot(tree)).toBe(tree);
  });
});

describe('compactSnapshot — 열린 대화상자', () => {
  it('dialog 하위 트리를 표시와 함께 맨 앞에 두고 나머지는 원래 순서로 뒤에 둔다', () => {
    const tree = lines(
      '- generic [ref=e1]:',
      '  - heading "승차권 예매" [level=2] [ref=e2]',
      '  - button "날짜 선택" [ref=e3]',
      '  - dialog "날짜 선택" [ref=e9]:',
      '    - button "적용" [ref=e10]',
      '    - button "레이어닫기" [ref=e11]',
    );
    expect(compactSnapshot(tree)).toBe(
      lines(
        OPEN_DIALOG_MARK,
        '- dialog "날짜 선택" [ref=e9]:',
        '  - button "적용" [ref=e10]',
        '  - button "레이어닫기" [ref=e11]',
        '- generic [ref=e1]:',
        '  - heading "승차권 예매" [level=2] [ref=e2]',
        '  - button "날짜 선택" [ref=e3]',
      ),
    );
  });

  it('dialog 가 없으면 표시 없이 순서를 그대로 둔다', () => {
    const tree = lines('- heading "목록" [level=1] [ref=e1]', '- button "다음" [ref=e2]');
    expect(compactSnapshot(tree)).toBe(tree);
  });
});
