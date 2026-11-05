import { RequestApprovalInputSchema, type TRequestApprovalInput } from '@shared/tools';

import type { IHumanTool, IHumanToolContext, THumanToolResult } from './toolType';

/** 승인 결과 — 모델에 그대로 간다 */
export const APPROVED_RESULT = 'approved';
/** 거부 결과 — is_error 아님 (FR-2·FR-4) */
export const DENIED_RESULT = 'denied: 사용자가 거부함. 다른 방법을 제안하거나 종료하라';

const MODEL_NOTE_MAX = 500;
const FALLBACK_DISPLAY = { action: '확인 요청', target: '' };
const FALLBACK_REASON = '에이전트가 확인을 요청함';

/** [request_approval] 모델이 스스로 사용자 확인을 받는다 — 승인 창 [승인]/[거부], 승인 상한(SR-4)에 포함 */
export const requestApprovalTool: IHumanTool<TRequestApprovalInput> = {
  name: 'request_approval',
  description:
    'Ask the user to approve something before you continue, when you are unsure whether the user wants it (for example a choice with a cost or an irreversible-looking step). ' +
    'The user sees your action, target and reason as your explanation and answers approve or deny; the run waits. ' +
    'You do not need this before clicking a confirm or pay button — the app already asks the user then. Each run allows only a few approval requests. ' +
    'Example input: {"action":"4명으로 변경","target":"인원 선택","reason":"할 일에는 2명이지만 2명 자리가 없습니다"}',
  inputSchema: RequestApprovalInputSchema,
  isApprovalRequest: true,
  executeWithContext: (ctx, input) => requestApproval(ctx, input),
};

async function requestApproval(ctx: IHumanToolContext, input: TRequestApprovalInput): Promise<THumanToolResult> {
  const answer = await ctx.waitForUser({
    kind: 'approval',
    approval: {
      stepN: ctx.stepN,
      kind: 'model',
      source: 'model',
      reason: ctx.approvalVerdict?.reason ?? FALLBACK_REASON,
      display: ctx.approvalVerdict?.display ?? FALLBACK_DISPLAY,
      modelNote: toModelNote(input),
    },
  });
  if (answer.type !== 'decision') return { status: 'halted' };
  if (answer.decision === 'approved') return { status: 'ok', text: APPROVED_RESULT, storedText: APPROVED_RESULT };
  return { status: 'denied', text: DENIED_RESULT, storedText: DENIED_RESULT };
}

/** 모델 문장 — 승인 창의 “에이전트 설명” 칸에만 (SR-3) */
function toModelNote({ action, target, reason }: TRequestApprovalInput): string {
  const note = target ? `${action} — ${target}: ${reason}` : `${action}: ${reason}`;
  return note.slice(0, MODEL_NOTE_MAX);
}
