/** 입력창 추천에 넣는 최근 작업 수 (spec 019 FR-1) */
export const RECENT_TASK_SUGGESTION_LIMIT = 5;

/** 사이트별 추천 — host 가 목록의 도메인이거나 그 하위면 그 문구 (위에서부터 첫 일치) */
const SITE_SUGGESTION_LIST: { hostList: string[]; suggestion: string }[] = [
  {
    hostList: ['map.naver.com', 'm.map.naver.com', 'pcmap.place.naver.com', 'm.place.naver.com'],
    suggestion: '이 가게 오늘 저녁 7시 2명 예약해줘',
  },
  {
    hostList: ['coupang.com', '11st.co.kr', 'gmarket.co.kr', 'smartstore.naver.com', 'shopping.naver.com'],
    suggestion: '이 상품 다른 쇼핑몰 최저가랑 비교해줘',
  },
];
const NEW_TAB_SUGGESTION = '네이버에서 맛집 검색해서 평점 높은 곳 3개 알려줘';
const PAGE_SUGGESTION = '이 페이지 핵심만 3줄로 요약해줘';

/** [사이트 추천] 지금 활성 탭 URL 에 맞는 추천 문구 하나 (spec 019 FR-1) — 새 탭·탭 없음·알 수 없는 URL 은 새 탭 문구 */
export function getSiteSuggestion(url: string | null): string {
  const host = getHttpHost(url);
  if (!host) return NEW_TAB_SUGGESTION;
  const matched = SITE_SUGGESTION_LIST.find(({ hostList }) =>
    hostList.some((domain) => isSameOrSubdomain(host, domain)),
  );
  return matched?.suggestion ?? PAGE_SUGGESTION;
}

/** [추천 목록] 사이트 추천 + 최근 작업(최신순, 공백 정리·빈 값·중복 제외, 최대 5개) */
export function createSuggestionList({
  activeUrl,
  recentTaskList,
}: {
  activeUrl: string | null;
  recentTaskList: string[];
}): string[] {
  const siteSuggestion = getSiteSuggestion(activeUrl);
  const recentList = [...new Set(recentTaskList.map((task) => task.trim()))]
    .filter((task) => task.length > 0 && task !== siteSuggestion)
    .slice(0, RECENT_TASK_SUGGESTION_LIMIT);
  return [siteSuggestion, ...recentList];
}

/**
 * [보일 추천] 빈 입력이면 첫 문구, 줄바꿈 없는 입력이면 그 입력으로 시작하고 더 긴 첫 문구, 없으면 null (spec 019 FR-2·3)
 */
export function findSuggestion(input: string, suggestionList: string[]): string | null {
  if (input.length === 0) return suggestionList[0] ?? null;
  if (input.includes('\n')) return null;
  return suggestionList.find((suggestion) => suggestion.length > input.length && suggestion.startsWith(input)) ?? null;
}

/** http·https URL 의 host — 그 밖(about:blank 등)이나 잘못된 URL 이면 null */
function getHttpHost(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.hostname : null;
  } catch {
    return null;
  }
}

function isSameOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
