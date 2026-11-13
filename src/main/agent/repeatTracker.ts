/**
 * [반복 감지] run 하나에서 같은 화면·같은 화면에서의 같은 행동이 몇 번째인지 센다 (spec 015 FR-5).
 * 3회째부터 결과에 안내 한 줄, 5회째면 run 을 멈추라는 신호를 낸다 (spec 024 FR-3 — 행동을 대신 실행하지는 않음).
 * 가드 판정은 바꾸지 않는다.
 */

/** 이 횟수부터 도구 결과에 반복 안내를 붙인다 */
export const REPEAT_THRESHOLD = 3;
/** 이 횟수가 되면 run 을 failed 로 끝낸다 (spec 024 FR-3) */
export const REPEAT_STOP_THRESHOLD = 5;

/** ref·포커스·커서 표시 — 같은 화면이어도 매번 달라진다 (spec 024 FR-2) */
const VOLATILE_MARK_PATTERN = /\s?\[(?:ref=[^\]]+|active|cursor=pointer)\]/g;

/** run 하나의 반복 횟수 — lastScreenKey 는 마지막으로 성공한 snapshot 의 화면 key (처음엔 '') */
export interface IRepeatTracker {
  lastScreenKey: string;
  /** key 를 한 번 더 세고 지금까지 몇 번째인지 돌려준다 */
  count(key: string): number;
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
  return {
    lastScreenKey: '',
    count(key) {
      const next = (countMap.get(key) ?? 0) + 1;
      countMap.set(key, next);
      return next;
    },
  };
}

/** 반복 key — snapshot 은 ref·포커스·커서 표시를 지운 결과 텍스트, 그 밖은 도구·요약·직전 화면 */
export function toRepeatKey({ tool, summary, resultText, lastScreenKey }: IRepeatKeyInput): string {
  if (tool === 'snapshot') return `snapshot|${resultText.replace(VOLATILE_MARK_PATTERN, '')}`;
  return `${tool}|${summary}|${lastScreenKey}`;
}

/** 도구 결과 끝에 붙이는 안내 — 기준 미만이면 '' */
export function toRepeatNotice(count: number): string {
  if (count < REPEAT_THRESHOLD) return '';
  if (count >= REPEAT_STOP_THRESHOLD) return `\n[반복 ${count}회째] 같은 행동·화면이 반복돼 실행을 멈춥니다`;
  return `\n[반복 ${count}회째] 같은 행동·화면이 반복됩니다 — 진전이 없으면 다른 방법을 쓰거나 ask_user 로 물어보세요`;
}

/** noteRepeat 결과 — notice 는 결과 끝에 붙일 안내, shouldStop 이면 호출부가 run 을 끝낸다 */
export interface IRepeatNote {
  notice: string;
  shouldStop: boolean;
}

/** 성공한 구조 도구 결과 1건을 세고 붙일 안내를 돌려준다 — snapshot 이면 lastScreenKey 를 갱신한다 */
export function noteRepeat(tracker: IRepeatTracker, input: Omit<IRepeatKeyInput, 'lastScreenKey'>): IRepeatNote {
  const key = toRepeatKey({ ...input, lastScreenKey: tracker.lastScreenKey });
  if (input.tool === 'snapshot') tracker.lastScreenKey = key;
  const count = tracker.count(key);
  return { notice: toRepeatNotice(count), shouldStop: count >= REPEAT_STOP_THRESHOLD };
}
