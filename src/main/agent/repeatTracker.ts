/**
 * [반복 감지] run 하나에서 ① 같은 화면·같은 화면에서의 같은 행동이 몇 번째인지(spec 015 FR-5),
 * ② 상태 변경 동작 묶음(길이 2~8)이 연달아 3번 반복됐는지(spec 026 FR-1) 센다.
 * 3·4회째는 결과에 안내 한 줄, 5회째·묶음 3연속이면 사용자에게 묻도록 신호를 낸다 (spec 026 FR-2 — 행동을 대신 실행하지는 않음).
 * 가드 판정은 바꾸지 않는다.
 */

/** 이 횟수부터 도구 결과에 반복 안내를 붙인다 */
export const REPEAT_THRESHOLD = 3;
/** 이 횟수가 되면 사용자에게 묻는다 (spec 026 FR-2) */
export const REPEAT_STOP_THRESHOLD = 5;
/** 동작 묶음 길이 범위와 반복 횟수 (spec 026 FR-1) */
export const CYCLE_MIN_LENGTH = 2;
export const CYCLE_MAX_LENGTH = 8;
export const CYCLE_REPEAT_COUNT = 3;

/** ref·포커스·커서 표시 — 같은 화면이어도 매번 달라진다 (spec 024 FR-2) */
const VOLATILE_MARK_PATTERN = /\s?\[(?:ref=[^\]]+|active|cursor=pointer)\]/g;

/** run 하나의 반복 기록 — lastScreenKey 는 마지막으로 성공한 snapshot 의 화면 key (처음엔 '') */
export interface IRepeatTracker {
  lastScreenKey: string;
  /** 성공한 상태 변경 동작 `{도구}|{요약}` 순서 */
  actionList: string[];
  /** 이미 물어본 차단 화면 `{URL 경로}|{문구}` — reset 해도 남는다 */
  askedBlockKeySet: Set<string>;
  /** key 를 한 번 더 세고 지금까지 몇 번째인지 돌려준다 */
  count(key: string): number;
  /** 사용자가 "계속" 을 고른 뒤 — 동작 순서·횟수·lastScreenKey 만 비운다 */
  reset(): void;
}

export interface IRepeatKeyInput {
  tool: string;
  summary: string;
  resultText: string;
  lastScreenKey: string;
}

/** run 마다 새로 만든다 */
export function createRepeatTracker(): IRepeatTracker {
  const countMap = new Map<string, number>();
  const tracker: IRepeatTracker = {
    lastScreenKey: '',
    actionList: [],
    askedBlockKeySet: new Set(),
    count(key) {
      const next = (countMap.get(key) ?? 0) + 1;
      countMap.set(key, next);
      return next;
    },
    reset() {
      countMap.clear();
      tracker.actionList = [];
      tracker.lastScreenKey = '';
    },
  };
  return tracker;
}

/** 반복 key — snapshot 은 ref·포커스·커서 표시를 지운 결과 텍스트, 그 밖은 도구·요약·직전 화면 */
export function toRepeatKey({ tool, summary, resultText, lastScreenKey }: IRepeatKeyInput): string {
  if (tool === 'snapshot') return `snapshot|${resultText.replace(VOLATILE_MARK_PATTERN, '')}`;
  return `${tool}|${summary}|${lastScreenKey}`;
}

/** 도구 결과 끝에 붙이는 안내 — 기준 미만이면 '' */
export function toRepeatNotice(count: number): string {
  if (count < REPEAT_THRESHOLD) return '';
  if (count >= REPEAT_STOP_THRESHOLD) return `\n[반복 ${count}회째] 같은 행동·화면이 반복돼 사용자에게 확인합니다`;
  return `\n[반복 ${count}회째] 같은 행동·화면이 반복됩니다 — 진전이 없으면 다른 방법을 쓰거나 ask_user 로 물어보세요`;
}

/** noteRepeat 결과 — notice 는 결과 끝에 붙일 안내, shouldAsk 면 호출부가 사용자에게 묻는다 */
export interface IRepeatNote {
  notice: string;
  shouldAsk: boolean;
}

/** 성공한 구조 도구 결과 1건을 세고 붙일 안내를 돌려준다 — snapshot 이면 lastScreenKey 를 갱신한다 */
export function noteRepeat(tracker: IRepeatTracker, input: Omit<IRepeatKeyInput, 'lastScreenKey'>): IRepeatNote {
  const key = toRepeatKey({ ...input, lastScreenKey: tracker.lastScreenKey });
  if (input.tool === 'snapshot') tracker.lastScreenKey = key;
  const count = tracker.count(key);
  return { notice: toRepeatNotice(count), shouldAsk: count >= REPEAT_STOP_THRESHOLD };
}

/** 성공한 상태 변경 동작을 순서에 더하고, 묶음이 3연속이면 그 묶음을 돌려준다 */
export function noteAction(tracker: IRepeatTracker, actionKey: string): string[] | null {
  tracker.actionList.push(actionKey);
  return findRepeatedCycle(tracker.actionList);
}

/**
 * 끝에서 길이 k(2~8) 묶음이 연달아 3번 나오면 그 묶음 — 없으면 null.
 * 원소가 모두 같은 묶음(주기 1)은 제외한다 — 같은 행동 연속은 같은 화면 5회 기준이 맡는다.
 */
export function findRepeatedCycle(actionList: readonly string[]): string[] | null {
  for (let length = CYCLE_MIN_LENGTH; length <= CYCLE_MAX_LENGTH; length += 1) {
    if (actionList.length < length * CYCLE_REPEAT_COUNT) break;
    const cycle = actionList.slice(-length);
    if (new Set(cycle).size === 1) continue;
    if (isRepeatedTail(actionList, cycle)) return cycle;
  }
  return null;
}

/** 목록 끝이 cycle 을 3번 연달아 이어 붙인 것인지 */
function isRepeatedTail(actionList: readonly string[], cycle: string[]): boolean {
  const tail = actionList.slice(-cycle.length * CYCLE_REPEAT_COUNT);
  return tail.every((action, index) => action === cycle[index % cycle.length]);
}
