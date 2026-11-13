import { describe, expect, it } from 'vitest';

import { resolveRefPlaceholders } from '../refPlaceholder';

/** snapshot 호출 → 결과 한 쌍 */
function createSnapshotPair(id: string, text: string): unknown[] {
  return [
    { role: 'assistant', content: [{ type: 'tool_use', id, name: 'snapshot', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text }] },
  ];
}

const OLD_SNAPSHOT = 'URL: a / 제목: a\n- button "예약 확정" [ref=e1]';
const NEW_SNAPSHOT = [
  'URL: b / 제목: b',
  '- main [ref=e1]:',
  '  - button "예약 조회" [ref=e4] [cursor=pointer]',
  '  - button "예약 확정" [ref=e5] [cursor=pointer]',
  '  - link "두 번째 페이지" [ref=e7]:',
].join('\n');

const MESSAGE_LIST = [
  { role: 'user', content: '할 일' },
  ...createSnapshotPair('toolu_1', OLD_SNAPSHOT),
  ...createSnapshotPair('toolu_2', NEW_SNAPSHOT),
];

describe('resolveRefPlaceholders', () => {
  it('마지막 snapshot 결과에서 role·name 이 같은 줄의 ref 로 바꾼다', () => {
    expect(resolveRefPlaceholders({ ref: '$ref(button:예약 확정)' }, MESSAGE_LIST)).toEqual({ ref: 'e5' });
  });

  it('공백이 있는 링크 이름도 찾는다', () => {
    expect(resolveRefPlaceholders({ ref: '$ref(link:두 번째 페이지)' }, MESSAGE_LIST)).toEqual({ ref: 'e7' });
  });

  it('재이동·iframe 의 프레임 접두사 ref(f2e5)도 찾는다', () => {
    const messageList = createSnapshotPair('t', '- generic [ref=f2e1]:\n  - button "다음" [ref=f3e2]');
    expect(resolveRefPlaceholders({ ref: '$ref(button:다음)' }, messageList)).toEqual({ ref: 'f3e2' });
  });

  it('못 찾으면 e0 으로 바꾼다', () => {
    expect(resolveRefPlaceholders({ ref: '$ref(button:없는 버튼)' }, MESSAGE_LIST)).toEqual({ ref: 'e0' });
  });

  it('snapshot 결과가 없으면 e0 으로 바꾼다', () => {
    expect(resolveRefPlaceholders({ ref: '$ref(button:예약 확정)' }, [])).toEqual({ ref: 'e0' });
  });

  it('중첩된 객체·배열 안의 값도 바꾸고 다른 값은 그대로 둔다', () => {
    const input = { outer: { list: ['$ref(button:예약 조회)', 'plain'] }, n: 3, ref: 'e9' };
    expect(resolveRefPlaceholders(input, MESSAGE_LIST)).toEqual({ outer: { list: ['e4', 'plain'] }, n: 3, ref: 'e9' });
  });

  it('배열 content 의 tool_result 텍스트도 읽는다', () => {
    const messageList = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'snapshot', input: {} }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: '- button "OK" [ref=e3]' }] },
        ],
      },
    ];
    expect(resolveRefPlaceholders({ ref: '$ref(button:OK)' }, messageList)).toEqual({ ref: 'e3' });
  });
});
