/**
 * [주소 해석] 주소창·새 탭 검색창 입력을 이동할 URL 또는 검색어로 나눈다 — renderer 가 목록 표시·이동 URL 계산에 쓴다.
 * main 은 http(s) 스키마로 다시 검증한다 (spec 002 SR-2·SR-3).
 */

export type TSearchEngine = 'naver' | 'google';

export type TAddressInput = { kind: 'url'; url: string } | { kind: 'search'; query: string };

/** 검색 선택 목록 순서 — 첫 줄(네이버)이 기본 강조 */
export const SEARCH_ENGINE_LIST: ReadonlyArray<{ engine: TSearchEngine; label: string }> = [
  { engine: 'naver', label: '네이버' },
  { engine: 'google', label: '구글' },
];

const EXPLICIT_HTTP_PATTERN = /^https?:\/\//i;
const LOCAL_HOST_PATTERN = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?(?:[/?#].*)?$/i;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i;

/** 입력을 해석한다 — URL 형태면 `url`, 아니면 `search`, 공백뿐이면 null */
export function resolveAddressInput(text: string): TAddressInput | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const url = toHttpUrl(trimmed);
  return url === null ? { kind: 'search', query: trimmed } : { kind: 'url', url };
}

/** 검색 엔진별 검색 결과 URL 을 만든다 */
export function buildSearchUrl(engine: TSearchEngine, query: string): string {
  const encoded = encodeURIComponent(query);
  if (engine === 'naver') return `https://search.naver.com/search.naver?query=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

/** URL 로 볼 수 있는 입력이면 스킴을 붙여 정규화한 http(s) URL 을, 아니면 null 을 돌려준다 */
function toHttpUrl(text: string): string | null {
  if (/\s/.test(text)) return null;
  if (EXPLICIT_HTTP_PATTERN.test(text)) return parseHttpUrl(text);
  if (LOCAL_HOST_PATTERN.test(text)) return parseHttpUrl(`http://${text}`);
  if (DOMAIN_PATTERN.test(text)) return parseHttpUrl(`https://${text}`);
  return null;
}

/** 파싱에 성공하고 http(s) 이면 정규화한 href, 아니면 null */
function parseHttpUrl(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname === '' ? null : url.href;
  } catch {
    return null;
  }
}
