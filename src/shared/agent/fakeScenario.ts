import { z } from 'zod';

/** [가짜 모델] 응답 text 블록 */
const FakeTextBlockSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * [가짜 모델] 응답 tool_use 블록 — input 의 문자열 `"$ref(role:name)"` 은 마지막 snapshot 결과의 ref 로 치환된다.
 * id 는 fakeFetch 가 `toolu_fake_{n}` 으로 붙인다.
 */
const FakeToolUseBlockSchema = z.strictObject({
  type: z.literal('tool_use'),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  /** 픽셀 도구 멤버 호출이면 'computer' — fakeFetch 가 content_block_start 에 그대로 싣는다 (spec 004) */
  toolset_name: z.literal('computer').optional(),
});

/** [가짜 모델] 한 턴 — stop_reason 생략 시 tool_use 블록이 있으면 tool_use, 없으면 end_turn */
export const FakeTurnSchema = z.strictObject({
  content: z.array(z.discriminatedUnion('type', [FakeTextBlockSchema, FakeToolUseBlockSchema])).min(1),
  stop_reason: z.enum(['tool_use', 'end_turn', 'max_tokens', 'refusal']).optional(),
});

/** [가짜 모델] e2e/fixtures/model/{이름}.json 의 형식 — `/v1/messages` 요청 n 번째에 turns[n] 을 재생한다 */
export const FakeScenarioSchema = z.strictObject({
  turns: z.array(FakeTurnSchema),
});

export type TFakeTurn = z.infer<typeof FakeTurnSchema>;
export type TFakeScenario = z.infer<typeof FakeScenarioSchema>;
