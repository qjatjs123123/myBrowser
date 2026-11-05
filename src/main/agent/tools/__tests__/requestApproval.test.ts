import { describe, expect, it, vi } from 'vitest';

import type { TWaitAnswer } from '../../waits';
import { APPROVED_RESULT, DENIED_RESULT, requestApprovalTool } from '../requestApproval';
import type { IHumanToolContext } from '../toolType';

const INPUT = { action: '4명으로 변경', target: '인원 선택', reason: '2명 자리가 없습니다' };
const VERDICT = {
  kind: 'require_approval' as const,
  reason: '에이전트가 확인을 요청함',
  display: { action: '확인 요청', target: '' },
};

function createContext(answer: TWaitAnswer): IHumanToolContext {
  return { stepN: 2, approvalVerdict: VERDICT, waitForUser: vi.fn(async () => answer) };
}

describe('requestApprovalTool', () => {
  it('이름은 request_approval 이고 승인 요청 도구다', () => {
    expect(requestApprovalTool.name).toBe('request_approval');
    expect(requestApprovalTool.isApprovalRequest).toBe(true);
    expect(requestApprovalTool.description).toMatch(/Example input: \{/);
  });

  it('예시 입력은 스키마를 통과하고 reason 이 비면 거부한다', () => {
    expect(requestApprovalTool.inputSchema.safeParse(INPUT).success).toBe(true);
    expect(requestApprovalTool.inputSchema.safeParse({ ...INPUT, reason: '' }).success).toBe(false);
  });

  it('display 는 가드 판정 값, 모델 문장은 modelNote 로만 넘긴다 (SR-3)', async () => {
    const ctx = createContext({ type: 'decision', decision: 'approved' });
    await requestApprovalTool.executeWithContext(ctx, INPUT);
    expect(ctx.waitForUser).toHaveBeenCalledWith({
      kind: 'approval',
      approval: {
        stepN: 2,
        kind: 'model',
        source: 'model',
        reason: VERDICT.reason,
        display: VERDICT.display,
        modelNote: '4명으로 변경 — 인원 선택: 2명 자리가 없습니다',
      },
    });
  });

  it('승인이면 approved 다', async () => {
    const result = await requestApprovalTool.executeWithContext(
      createContext({ type: 'decision', decision: 'approved' }),
      INPUT,
    );
    expect(result).toEqual({ status: 'ok', text: APPROVED_RESULT, storedText: APPROVED_RESULT });
  });

  it('거부면 denied 결과다', async () => {
    const result = await requestApprovalTool.executeWithContext(
      createContext({ type: 'decision', decision: 'denied' }),
      INPUT,
    );
    expect(result).toEqual({ status: 'denied', text: DENIED_RESULT, storedText: DENIED_RESULT });
  });

  it('대기가 취소되면 halted 다', async () => {
    const result = await requestApprovalTool.executeWithContext(
      createContext({ type: 'cancelled', reason: 'shutdown' }),
      INPUT,
    );
    expect(result).toEqual({ status: 'halted' });
  });

  it('modelNote 는 500자로 자른다', async () => {
    const ctx = createContext({ type: 'decision', decision: 'approved' });
    await requestApprovalTool.executeWithContext(ctx, {
      action: 'a'.repeat(100),
      target: 'b'.repeat(200),
      reason: 'c'.repeat(300),
    });
    const request = vi.mocked(ctx.waitForUser).mock.calls[0]?.[0];
    expect(request?.kind === 'approval' ? request.approval.modelNote?.length : 0).toBe(500);
  });
});
