import { describe, expect, it } from 'vitest';

import {
  CONFIRM_PATTERN_LIST,
  CONFIRM_URL_PATTERN_LIST,
  DESTRUCTIVE_PATTERN_LIST,
  findMatchedPattern,
  normalizeText,
  PRIVATE_HOST_PATTERN_LIST,
  SECRET_AUTOCOMPLETE_LIST,
  SECRET_FIELD_PATTERN_LIST,
} from '../rules';

/** 패턴 목록에 걸리는지 */
function isMatched(text: string, list: Parameters<typeof findMatchedPattern>[1]): boolean {
  return findMatchedPattern(text, list) !== null;
}

describe('normalizeText', () => {
  it('NBSP 를 공백으로 바꾸고 연속 공백을 1개로 줄이고 앞뒤를 자른다', () => {
    expect(normalizeText('  예약   확정 \n')).toBe('예약 확정');
  });
});

describe('CONFIRM_PATTERN_LIST (규칙 1)', () => {
  it.each(['예약 확정', '예약확정', '예약하기', '결제하기', '주문하기', '구매', '송금', '이체', '전송', '제출'])(
    '“%s” 는 걸린다',
    (text) => {
      expect(isMatched(text, CONFIRM_PATTERN_LIST)).toBe(true);
    },
  );

  it.each(['Pay now', 'Confirm', 'Checkout', 'Purchase', 'Submit order', 'Place order', 'Book now', 'Reserve'])(
    '“%s” 는 걸린다',
    (text) => {
      expect(isMatched(text, CONFIRM_PATTERN_LIST)).toBe(true);
    },
  );

  it('NBSP 가 섞인 “예약\\u00a0확정” 도 걸린다', () => {
    expect(isMatched('예약 확정', CONFIRM_PATTERN_LIST)).toBe(true);
  });

  it('“결제 내역” 은 한국어 부분 일치라 걸린다', () => {
    expect(isMatched('결제 내역', CONFIRM_PATTERN_LIST)).toBe(true);
  });

  it('href “/checkout” 은 걸린다', () => {
    expect(isMatched('https://shop.example/checkout?step=1', CONFIRM_PATTERN_LIST)).toBe(true);
  });

  it.each(['예약 조회', 'payment history', 'Repayment plan', 'Confirmation code', 'Reserved seats', '검색'])(
    '“%s” 는 안 걸린다',
    (text) => {
      expect(isMatched(text, CONFIRM_PATTERN_LIST)).toBe(false);
    },
  );

  it('빈 문자열은 안 걸린다', () => {
    expect(isMatched('   ', CONFIRM_PATTERN_LIST)).toBe(false);
  });

  it('걸린 항목의 reason 을 돌려준다', () => {
    expect(findMatchedPattern('예약 확정', CONFIRM_PATTERN_LIST)?.reason).toContain('예약 확정');
  });
});

describe('CONFIRM_URL_PATTERN_LIST (규칙 1 — 현재 URL)', () => {
  it.each(['https://shop.example/checkout', 'https://pg.example/payment/start', 'https://a.example/order/confirm'])(
    '%s 는 걸린다',
    (url) => {
      expect(isMatched(url, CONFIRM_URL_PATTERN_LIST)).toBe(true);
    },
  );

  it('일반 검색 결과 URL 은 안 걸린다', () => {
    expect(isMatched('https://search.example/?q=맛집', CONFIRM_URL_PATTERN_LIST)).toBe(false);
  });
});

describe('DESTRUCTIVE_PATTERN_LIST (규칙 4)', () => {
  it.each(['회원 탈퇴', '삭제', '구독 해지', '취소하기', 'Delete account', 'Unsubscribe', 'Cancel subscription'])(
    '“%s” 는 걸린다',
    (text) => {
      expect(isMatched(text, DESTRUCTIVE_PATTERN_LIST)).toBe(true);
    },
  );

  it.each(['취소', 'Deleted items', '회원 정보'])('“%s” 는 안 걸린다', (text) => {
    expect(isMatched(text, DESTRUCTIVE_PATTERN_LIST)).toBe(false);
  });
});

describe('SECRET_FIELD_PATTERN_LIST (규칙 2 — name·label)', () => {
  it.each(['password', 'user_password', '비밀번호', '카드번호', 'card-cvc', 'CVV', '주민등록번호'])(
    '“%s” 는 걸린다',
    (text) => {
      expect(isMatched(text, SECRET_FIELD_PATTERN_LIST)).toBe(true);
    },
  );

  it.each(['query', '검색어', '이름'])('“%s” 는 안 걸린다', (text) => {
    expect(isMatched(text, SECRET_FIELD_PATTERN_LIST)).toBe(false);
  });
});

describe('SECRET_AUTOCOMPLETE_LIST (규칙 2 — autocomplete)', () => {
  it.each(['cc-number', 'billing cc-number', 'cc-csc', 'one-time-code'])('“%s” 는 걸린다', (text) => {
    expect(isMatched(text, SECRET_AUTOCOMPLETE_LIST)).toBe(true);
  });

  it.each(['cc-name', 'email', 'off'])('“%s” 는 안 걸린다', (text) => {
    expect(isMatched(text, SECRET_AUTOCOMPLETE_LIST)).toBe(false);
  });
});

describe('PRIVATE_HOST_PATTERN_LIST (규칙 3 — hostname)', () => {
  it.each([
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '10.1.2.3',
    '192.168.0.1',
    '172.16.0.1',
    '172.31.255.1',
    '[::1]',
  ])('%s 는 걸린다', (host) => {
    expect(isMatched(host, PRIVATE_HOST_PATTERN_LIST)).toBe(true);
  });

  it.each(['example.com', '172.32.0.1', '172.15.0.1', '8.8.8.8', '10.example.com', 'mylocalhost.com'])(
    '%s 는 안 걸린다',
    (host) => {
      expect(isMatched(host, PRIVATE_HOST_PATTERN_LIST)).toBe(false);
    },
  );
});
