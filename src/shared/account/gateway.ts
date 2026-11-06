import { z } from 'zod';

/**
 * [게이트웨이 HTTP 계약] mybrowser-gateway 레포와 공유하는 단일 출처 (spec 005 「게이트웨이 HTTP 계약」).
 * 키는 snake_case, 시각은 UTC `Z` 형식. 앱은 모든 응답을 이 스키마로 검증한다.
 */

/** 기기 이름 최대 길이 — 앱이 hostname 을 이 길이로 자른다 (게이트웨이 계약) */
export const DEVICE_NAME_MAX_LENGTH = 64;

/** [POST /v1/activations] 요청 본문 */
export const CreateActivationRequestSchema = z.strictObject({
  device_name: z.string().min(1).max(DEVICE_NAME_MAX_LENGTH),
});

/** [POST /v1/activations] 201 data */
export const ActivationCreatedSchema = z.strictObject({
  activation_id: z.uuid(),
  poll_secret: z.string().min(32).max(128),
  purchase_url: z.url(),
  expires_at: z.iso.datetime(),
  poll_interval_sec: z.number().int().min(1).max(30),
});

/** [GET /v1/activations/{id}] 200 data — device_token 은 approved 에 딱 1번만 실린다 */
export const ActivationPollSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('pending') }),
  z.strictObject({ status: z.literal('approved'), device_token: z.string().min(32).max(256) }),
  z.strictObject({ status: z.literal('expired') }),
  z.strictObject({ status: z.literal('consumed') }),
]);

/** [GET /v1/account] 200 data */
export const AccountInfoSchema = z.strictObject({
  credits: z.number().int(),
  plan: z.string().nullable(),
  subscription_status: z.enum(['active', 'past_due', 'canceled', 'none']),
  renews_at: z.iso.datetime().nullable(),
  manage_url: z.url(),
});

/** 성공 envelope `{ status: 'success', data }` 스키마를 만든다 */
export function toEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({ status: z.literal('success'), data });
}

/** 4xx 실패 envelope — message 는 사용자에게 보일 한국어 문장 */
export const FailEnvelopeSchema = z.strictObject({
  status: z.literal('fail'),
  data: z.object({ code: z.number().int(), message: z.string() }),
});

/** 5xx 오류 envelope — data 의 모양은 정하지 않는다 */
export const ErrorEnvelopeSchema = z.strictObject({
  status: z.literal('error'),
  data: z.record(z.string(), z.unknown()),
});

export type TCreateActivationRequest = z.infer<typeof CreateActivationRequestSchema>;
export type TActivationCreated = z.infer<typeof ActivationCreatedSchema>;
export type TActivationPoll = z.infer<typeof ActivationPollSchema>;
export type TAccountInfo = z.infer<typeof AccountInfoSchema>;
export type TFailEnvelope = z.infer<typeof FailEnvelopeSchema>;
