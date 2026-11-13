import { describe, expect, it } from 'vitest';

import { findBlockScreenPhrase } from '../blockScreen';

describe('findBlockScreenPhrase (spec 026 FR-3)', () => {
  it.each([
    '- paragraph [ref=e900]: 매크로, 개발자도구 등 미허가 도구 사용 시 이용이 제한될 수 있습니다.',
    '- generic [ref=e824]: 서비스 연결대기 중입니다',
    '- heading "자동입력 방지 문자를 입력해 주세요" [level=2]',
    '- textbox "보안문자 입력" [ref=e3]',
    '- iframe "reCAPTCHA" [ref=e5]',
    '- checkbox "로봇이 아닙니다" [ref=e6]',
    "- paragraph: Our systems have detected unusual traffic from your computer network.",
    '- paragraph: 비정상적인 접근이 감지되었습니다',
    '- text: 현재 접속 대기 중입니다. 대기순번 1,234',
  ])('차단 화면 문구를 찾는다: %s', (line) => {
    expect(findBlockScreenPhrase(`URL: a / 제목: b\n${line}`)).not.toBeNull();
  });

  it.each([
    '- link "엑셀 매크로 강좌" [ref=e1]',
    '- paragraph: 오늘 저녁 7시 2명 예약 가능합니다',
    '- button "대기 없이 바로 예약" [ref=e2]',
  ])('일반 문장은 찾지 않는다: %s', (line) => {
    expect(findBlockScreenPhrase(line)).toBeNull();
  });

  it('찾은 줄은 문구 앞뒤 60자까지만 보인다', () => {
    const line = `${'가'.repeat(100)} 보안문자 ${'나'.repeat(100)}`;
    const phrase = findBlockScreenPhrase(line) ?? '';
    expect(phrase).toContain('보안문자');
    expect(phrase.length).toBeLessThanOrEqual(60 * 2 + '보안문자'.length);
  });
});
