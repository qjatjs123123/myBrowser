const MAC_USER_AGENT_PATTERN = /Macintosh|Mac OS X/;

/** macOS 인가 — 창 신호등을 네이티브로 쓸지 정한다 (spec 010 FR-4, IPC 없이 renderer 에서 판정) */
export function isMacPlatform(userAgent: string): boolean {
  return MAC_USER_AGENT_PATTERN.test(userAgent);
}

const LINUX_USER_AGENT_PATTERN = /Linux/;
const ANDROID_USER_AGENT_PATTERN = /Android/;

/** Linux 인가 — 앱이 창 모서리를 직접 둥글게 그린다 (spec 014, main 의 hasRoundedCorners 와 같은 판정) */
export function isLinuxPlatform(userAgent: string): boolean {
  return LINUX_USER_AGENT_PATTERN.test(userAgent) && !ANDROID_USER_AGENT_PATTERN.test(userAgent);
}
