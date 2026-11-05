const ALLOWED_PROTOCOL_LIST = ['http:', 'https:'];
const NEW_TAB_URL = 'about:blank';

/**
 * [탭 URL 정책] 탭이 이동·새 탭으로 열 수 있는 URL 인지 — http·https 와 새 탭의 about:blank 만 (SR-2).
 * file:·javascript:·data:·커스텀 스킴은 거부한다.
 */
export function isAllowedTabUrl(url: string): boolean {
  if (url === NEW_TAB_URL) return true;
  if (!URL.canParse(url)) return false;
  return ALLOWED_PROTOCOL_LIST.includes(new URL(url).protocol);
}
