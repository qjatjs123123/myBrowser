import { describe, expect, it, vi } from 'vitest';

import type { TWaitAnswer } from '../../waits';
import { askUserTool, OMITTED_ANSWER } from '../askUser';
import type { IHumanToolContext } from '../toolType';

function createContext(answer: TWaitAnswer): IHumanToolContext {
  return { stepN: 3, approvalVerdict: null, waitForUser: vi.fn(async () => answer) };
}

describe('askUserTool', () => {
  it('이름은 ask_user 이고 설명에 예시 입력이 있다', () => {
    expect(askUserTool.name).toBe('ask_user');
    expect(askUserTool.description).toMatch(/Example input: \{/);
    expect(askUserTool.isApprovalRequest).toBe(false);
  });

  it('예시 입력은 스키마를 통과한다', () => {
    const input = { question: '몇 명으로 예약할까요?', optionList: ['2명', '4명'] };
    expect(askUserTool.inputSchema.safeParse(input).success).toBe(true);
  });

  it('질문이 비었거나 선택지가 7개면 스키마가 거부한다', () => {
    expect(askUserTool.inputSchema.safeParse({ question: '' }).success).toBe(false);
    const optionList = ['1', '2', '3', '4', '5', '6', '7'];
    expect(askUserTool.inputSchema.safeParse({ question: 'q', optionList }).success).toBe(false);
  });

  it('질문을 ctx.waitForUser 로 넘기고 선택지가 없으면 빈 목록이다', async () => {
    const ctx = createContext({ type: 'answer', answer: '2명' });
    await askUserTool.executeWithContext(ctx, { question: '몇 명?' });
    expect(ctx.waitForUser).toHaveBeenCalledWith({
      kind: 'question',
      question: { stepN: 3, text: '몇 명?', optionList: [] },
    });
  });

  it('답이 오면 “사용자 답: …” 을 모델에 주고 저장값은 생략 표시다', async () => {
    const ctx = createContext({ type: 'answer', answer: '2명' });
    expect(await askUserTool.executeWithContext(ctx, { question: '몇 명?' })).toEqual({
      status: 'ok',
      text: '사용자 답: 2명',
      storedText: OMITTED_ANSWER,
    });
  });

  it('대기가 취소되면 halted 다', async () => {
    const ctx = createContext({ type: 'cancelled', reason: 'stopped' });
    expect(await askUserTool.executeWithContext(ctx, { question: '몇 명?' })).toEqual({ status: 'halted' });
  });
});
