import { z } from 'zod';

/**
 * [account] 계정 카드 상태 — main 이 단일 출처. 기기 토큰·poll_secret 은 싣지 않는다 (spec 005 SR-1·SR-2).
 * account:getStatus|startActivation|cancelActivation|signOut 의 응답이자 account:changed 이벤트 payload.
 */
export const AccountStatusSchema = z.discriminatedUnion('state', [
  /** direct·fake 모드 — 구독이 필요 없다 */
  z.strictObject({ state: z.literal('not_required') }),
  /** 토큰 없음 — message 는 만료·해제 안내 */
  z.strictObject({ state: z.literal('inactive'), message: z.string().optional() }),
  z.strictObject({ state: z.literal('activating'), activationId: z.uuid(), expiresAt: z.iso.datetime() }),
  z.strictObject({
    state: z.literal('active'),
    /** 아직 못 읽었으면 null */
    credits: z.number().int().nullable(),
    plan: z.string().nullable(),
    renewsAt: z.iso.datetime().nullable(),
  }),
]);

export type TAccountStatus = z.infer<typeof AccountStatusSchema>;
