/**
 * [차단 화면] 페이지 글에서 자동 조작을 막는 화면(매크로 경고·보안문자·접속 대기열)의 문구를 찾는다 (spec 026 FR-3).
 * 찾으면 에이전트는 우회하지 않고 사용자에게 넘긴다 (SR-2) — 이 파일은 찾기만 한다.
 */

/** 찾은 줄에서 문구 앞뒤로 보일 글자 수 */
const PHRASE_CONTEXT_LENGTH = 60;

/** 차단 화면 문구 — 대소문자 무시, 줄 단위로 검사 */
export const BLOCK_SCREEN_PATTERN_LIST: readonly RegExp[] = [
  /매크로.{0,40}(제한|차단|금지|탐지|방지)/,
  /자동\s?입력\s?방지/,
  /보안\s?문자/,
  /captcha/i,
  /로봇이 아닙니다/,
  /not a robot/i,
  /verify (that )?you are (a )?human/i,
  /unusual traffic/i,
  /비정상적인 (접근|요청|트래픽)/,
  /서비스 연결\s?대기/,
  /접속\s?대기/,
  /대기\s?순번/,
];

/** 첫 번째로 걸린 줄의 문구 주변(앞뒤 최대 60자) — 없으면 null */
export function findBlockScreenPhrase(text: string): string | null {
  for (const line of text.split('\n')) {
    for (const pattern of BLOCK_SCREEN_PATTERN_LIST) {
      const matched = pattern.exec(line);
      if (matched) return clipAround(line, matched.index, matched[0].length);
    }
  }
  return null;
}

/** 걸린 부분 앞뒤 60자만 — 앞뒤 공백·목록 표시는 지운다 */
function clipAround(line: string, start: number, length: number): string {
  const from = Math.max(0, start - PHRASE_CONTEXT_LENGTH);
  const to = Math.min(line.length, start + length + PHRASE_CONTEXT_LENGTH);
  return line.slice(from, to).trim().replace(/^- /, '');
}
