const MAC_USER_AGENT_PATTERN = /Macintosh|Mac OS X/;

/** macOS 인가 — 창 신호등을 네이티브로 쓸지 정한다 (spec 010 FR-4, IPC 없이 renderer 에서 판정) */
export function isMacPlatform(userAgent: string): boolean {
  return MAC_USER_AGENT_PATTERN.test(userAgent);
}
