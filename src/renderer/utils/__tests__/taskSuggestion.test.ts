import { describe, expect, it } from 'vitest';

import {
  createSuggestionList,
  findSuggestion,
  getSiteSuggestion,
  RECENT_TASK_SUGGESTION_LIMIT,
} from '../taskSuggestion';

const NEW_TAB = '네이버에서 맛집 검색해서 평점 높은 곳 3개 알려줘';
const PLACE = '이 가게 오늘 저녁 7시 2명 예약해줘';
const SHOPPING = '이 상품 다른 쇼핑몰 최저가랑 비교해줘';
const PAGE = '이 페이지 핵심만 3줄로 요약해줘';

describe('getSiteSuggestion (spec 019 FR-1)', () => {
  it.each([
    ['about:blank', NEW_TAB],
    [null, NEW_TAB],
    ['not a url', NEW_TAB],
    ['https://map.naver.com/p/search/카페', PLACE],
    ['https://m.place.naver.com/restaurant/123', PLACE],
    ['https://pcmap.place.naver.com/restaurant/1/home', PLACE],
    ['https://www.coupang.com/vp/products/1', SHOPPING],
    ['https://smartstore.naver.com/shop/products/1', SHOPPING],
    ['http://www.11st.co.kr/products/1', SHOPPING],
    ['https://www.naver.com/', PAGE],
    ['http://127.0.0.1:5000/page.html', PAGE],
    ['https://notcoupang.com/', PAGE],
  ])('%s 이면 「%s」', (url, expected) => {
    expect(getSiteSuggestion(url)).toBe(expected);
  });
});

describe('createSuggestionList (spec 019 FR-1)', () => {
  it('사이트 추천이 맨 앞이고 최근 작업이 최신순으로 뒤에 붙는다', () => {
    expect(createSuggestionList({ activeUrl: 'about:blank', recentTaskList: ['둘째', '첫째'] })).toEqual([
      NEW_TAB,
      '둘째',
      '첫째',
    ]);
  });

  it('최근 작업은 앞뒤 공백을 지우고 빈 값·중복·사이트 추천과 같은 문구를 뺀다', () => {
    const recentTaskList = ['  가 ', '', '가', '   ', NEW_TAB, '나'];
    expect(createSuggestionList({ activeUrl: null, recentTaskList })).toEqual([NEW_TAB, '가', '나']);
  });

  it('최근 작업은 최대 정한 개수까지만 넣는다', () => {
    const recentTaskList = Array.from({ length: 8 }, (_, index) => `작업 ${index}`);
    const suggestionList = createSuggestionList({ activeUrl: null, recentTaskList });
    expect(suggestionList).toHaveLength(1 + RECENT_TASK_SUGGESTION_LIMIT);
    expect(suggestionList.at(-1)).toBe(`작업 ${RECENT_TASK_SUGGESTION_LIMIT - 1}`);
  });
});

describe('findSuggestion (spec 019 FR-2·3)', () => {
  const suggestionList = [PAGE, '네이버에서 날씨 알려줘', '네이버에서 맛집 찾아줘'];

  it('빈 입력이면 첫 문구', () => {
    expect(findSuggestion('', suggestionList)).toBe(PAGE);
  });

  it('입력으로 시작하는 더 긴 문구 중 목록에서 먼저 나온 것', () => {
    expect(findSuggestion('네이버에서 ', suggestionList)).toBe('네이버에서 날씨 알려줘');
    expect(findSuggestion('네이버에서 맛', suggestionList)).toBe('네이버에서 맛집 찾아줘');
  });

  it('입력과 똑같은 문구는 이어 쓸 것이 없어 고르지 않는다', () => {
    expect(findSuggestion(PAGE, suggestionList)).toBeNull();
  });

  it('일치하는 문구가 없거나 줄바꿈이 있으면 null', () => {
    expect(findSuggestion('쿠팡', suggestionList)).toBeNull();
    expect(findSuggestion('이 페이지\n', suggestionList)).toBeNull();
  });

  it('추천 목록이 비면 빈 입력이어도 null', () => {
    expect(findSuggestion('', [])).toBeNull();
  });
});
