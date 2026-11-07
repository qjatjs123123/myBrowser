/**
 * [반복 감지] run 하나에서 같은 화면·같은 화면에서의 같은 행동이 몇 번째인지 센다 (spec 015 FR-5).
 * 결과에 안내 한 줄을 붙일 뿐 실행·가드 판정은 바꾸지 않는다 (SR-2).
 */

/** 이 횟수부터 도구 결과에 반복 안내를 붙인다 */
export const REPEAT_THRESHOLD = 3;

const REF_PATTERN = /\s?\[ref=[^\]]+\]/g;

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

/** 반복 key — snapshot 은 ref 를 지운 결과 텍스트(ref 는 매번 새로 매겨진다), 그 밖은 도구·요약·직전 화면 */
export function toRepeatKey({ tool, summary, resultText, lastScreenKey }: IRepeatKeyInput): string {
  if (tool === 'snapshot') return `snapshot|${resultText.replace(REF_PATTERN, '')}`;
  return `${tool}|${summary}|${lastScreenKey}`;
}

/** 도구 결과 끝에 붙이는 안내 — 기준 미만이면 '' */
export function toRepeatNotice(count: number): string {
  if (count < REPEAT_THRESHOLD) return '';
  return `\n[반복 ${count}회째] 같은 행동·화면이 반복됩니다 — 진전이 없으면 다른 방법을 쓰거나 ask_user 로 물어보세요`;
}

/** 성공한 구조 도구 결과 1건을 세고 붙일 안내를 돌려준다 — snapshot 이면 lastScreenKey 를 갱신한다 */
export function noteRepeat(tracker: IRepeatTracker, input: Omit<IRepeatKeyInput, 'lastScreenKey'>): string {
  const key = toRepeatKey({ ...input, lastScreenKey: tracker.lastScreenKey });
  if (input.tool === 'snapshot') tracker.lastScreenKey = key;
  return toRepeatNotice(tracker.count(key));
}
