/**
 * [snapshot 자르기] 상한을 넘으면 앞부분 + 잘림 표시, 그리고 잘린 부분에 있던 누를 수 있는 요소 줄(ref 포함 원문)을 덧붙인다 (spec 025 FR-2).
 * 긴 레이어 아래쪽의 [확인]·[선택 완료] 가 잘려 모델이 [닫기] 만 보고 선택을 버리던 문제를 막는다.
 */

/** 잘린 부분 목록 제목 */
export const CUT_ACTIONABLE_TITLE = '[잘린 부분의 누를 수 있는 요소]';
/** 목록 최대 글자 수 */
export const CUT_ACTIONABLE_MAX_LENGTH = 3000;

/** 이름이 있는 누를 수 있는 요소 줄 — `- button "선택 완료" [ref=e9]` */
const ACTIONABLE_LINE_PATTERN =
  /^- (button|link|textbox|searchbox|combobox|checkbox|radio|switch|tab|menuitem|option|spinbutton) "[^"]+"/;

/** text 가 maxLength 를 넘으면 `{앞}{mark}` + 잘린 부분의 누를 수 있는 요소 목록 — 넘지 않으면 그대로 */
export function truncateWithActionables(text: string, maxLength: number, mark: string): string {
  if (text.length <= maxLength) return text;
  const head = `${text.slice(0, maxLength)}${mark}`;
  // 자른 위치가 든 줄의 시작부터 잘린 부분으로 센다 — 경계 줄의 ref 도 살린다
  const cutStart = text.lastIndexOf('\n', maxLength - 1) + 1;
  const actionableList = findActionableLineList(text.slice(cutStart));
  return actionableList.length === 0 ? head : `${head}\n${CUT_ACTIONABLE_TITLE}\n${limitLineList(actionableList)}`;
}

/** 조건에 맞는 줄(앞 공백 제거)을 중복 없이 순서대로 */
function findActionableLineList(cutText: string): string[] {
  const lineList = cutText
    .split('\n')
    .map((line) => line.trimStart())
    .filter((line) => ACTIONABLE_LINE_PATTERN.test(line) && !line.includes('[disabled]'));
  return [...new Set(lineList)];
}

/** 3,000 자까지 싣고 남은 개수는 `- (외 k개)` */
function limitLineList(lineList: string[]): string {
  const shownList: string[] = [];
  let length = 0;
  for (const line of lineList) {
    if (length + line.length + 1 > CUT_ACTIONABLE_MAX_LENGTH) break;
    shownList.push(line);
    length += line.length + 1;
  }
  const rest = lineList.length - shownList.length;
  return [...shownList, ...(rest > 0 ? [`- (외 ${String(rest)}개)`] : [])].join('\n');
}
