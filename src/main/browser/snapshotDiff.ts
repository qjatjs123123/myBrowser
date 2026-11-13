/**
 * [화면 변화] 클릭 전후 화면 글(innerText — 메인·하위 프레임)을 줄 단위로 비교해 모델에 줄 요약을 만든다 (spec 024 FR-1).
 * 선택 상태가 접근성 트리에 안 보이는 사이트에서 "눌렀더니 무엇이 나타났나/사라졌나" 로 반영 여부를 판단하게 한다.
 */

/** 나타남·사라짐 각각 보여 줄 최대 줄 수 */
export const SCREEN_CHANGE_MAX_LINES = 6;
/** 한 줄 최대 글자 수 */
export const SCREEN_CHANGE_LINE_MAX = 60;

export const NO_SCREEN_CHANGE_NOTE =
  '\n화면 변화 없음 — 선택 표시가 트리에 안 보일 수 있다. 같은 대상을 다시 누르지 말고 다음 단계로 간다';


export interface IScreenDiff {
  addedList: string[];
  removedList: string[];
}

/** 비교할 줄 목록 — 앞뒤 공백을 지우고 빈 줄은 뺀다 */
export function toScreenLineList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/** 전후 줄의 다중집합 차 — 같은 줄이 여러 번 있으면 개수 차만큼 */
export function diffScreen(beforeText: string, afterText: string): IScreenDiff {
  const beforeList = toScreenLineList(beforeText);
  const afterList = toScreenLineList(afterText);
  return { addedList: subtractList(afterList, beforeList), removedList: subtractList(beforeList, afterList) };
}

/** 모델에 붙일 문구 — 변화가 없으면 재클릭 금지 안내 */
export function formatScreenChange({ addedList, removedList }: IScreenDiff): string {
  const partList = [toPart('나타남', addedList), toPart('사라짐', removedList)].filter((part) => part !== '');
  return partList.length === 0 ? NO_SCREEN_CHANGE_NOTE : `\n화면 변화: ${partList.join(' / ')}`;
}

function toPart(label: string, lineList: string[]): string {
  if (lineList.length === 0) return '';
  const shownList = lineList.slice(0, SCREEN_CHANGE_MAX_LINES).map(clipLine);
  const rest = lineList.length - shownList.length;
  return `${label} ${String(lineList.length)}줄 — ${shownList.join(' · ')}${rest > 0 ? ` 외 ${String(rest)}줄` : ''}`;
}

function clipLine(line: string): string {
  return line.length > SCREEN_CHANGE_LINE_MAX ? `${line.slice(0, SCREEN_CHANGE_LINE_MAX)}…` : line;
}

/** sourceList 에서 removeList 를 개수만큼 뺀 나머지 (순서 유지) */
function subtractList(sourceList: string[], removeList: string[]): string[] {
  const countMap = new Map<string, number>();
  for (const line of removeList) countMap.set(line, (countMap.get(line) ?? 0) + 1);
  return sourceList.filter((line) => {
    const left = countMap.get(line) ?? 0;
    if (left === 0) return true;
    countMap.set(line, left - 1);
    return false;
  });
}
