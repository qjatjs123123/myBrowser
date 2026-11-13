import { describe, expect, it, vi } from 'vitest';

import type { IBrowserDriver } from '@shared/tools';

import { createRepeatTracker } from '../../repeatTracker';
import type { TWaitAnswer } from '../../waits';
import { annotateWithHandover, HANDOVER_OPTION } from '../handover';
import type { IToolRunContext, TUserRequest } from '../index';

const BLOCK_TEXT =
  'URL: https://k.com/a / 제목: k\n- paragraph: 매크로, 개발자도구 등 미허가 도구 사용 시 이용이 제한될 수 있습니다.';

/** 넘기기에 필요한 것만 채운 ctx — 질문 답을 정해 두고 질문을 모은다 */
function createContext(answer: TWaitAnswer, url = 'https://k.com/a') {
  let n = 0;
  const requestList: TUserRequest[] = [];
  const ctx = {
    driver: { getPageInfo: vi.fn(async () => ({ url, title: '' })) } as unknown as IBrowserDriver,
    beginStep: vi.fn(() => ++n),
    endStep: vi.fn(),
    waitForUser: vi.fn(async (request: TUserRequest) => {
      requestList.push(request);
      return answer;
    }),
    stopByUser: vi.fn(),
    repeatTracker: createRepeatTracker(),
  } as unknown as IToolRunContext;
  const questionTextList = () =>
    requestList.flatMap((request) => (request.kind === 'question' ? [request.question.text] : []));
  return { ctx, requestList, questionTextList };
}

const answerOf = (text: string): TWaitAnswer => ({ type: 'answer', answer: text });

describe('annotateWithHandover (spec 026)', () => {
  it('반복도 차단 문구도 없으면 결과를 그대로 돌려주고 묻지 않는다', async () => {
    const { ctx, requestList } = createContext(answerOf('x'));
    await expect(annotateWithHandover(ctx, { tool: 'click', summary: '‘A’ 클릭', value: '클릭함' })).resolves.toBe(
      '클릭함',
    );
    expect(requestList).toEqual([]);
  });

  it('상태 변경 동작 묶음이 3번이면 묶음 요약을 담아 묻고, 계속이면 반복 기록을 비운다', async () => {
    const { ctx, questionTextList } = createContext(answerOf(HANDOVER_OPTION.repeatContinue));
    let last = '';
    for (let round = 0; round < 3; round += 1) {
      await annotateWithHandover(ctx, { tool: 'click', summary: '‘30’ 클릭', value: '클릭함' });
      last = await annotateWithHandover(ctx, { tool: 'click', summary: '‘레이어닫기’ 클릭', value: '클릭함' });
    }
    expect(questionTextList()).toEqual([
      '같은 동작을 반복하고 있습니다: ‘30’ 클릭 → ‘레이어닫기’ 클릭. 어떻게 할까요?',
    ]);
    // 같은 화면(snapshot 없음)에서 같은 click 3회째라 반복 안내가 먼저, 사용자 확인이 끝에 붙는다
    expect(last).toBe(
      '클릭함\n[반복 3회째] 같은 행동·화면이 반복됩니다 — 진전이 없으면 다른 방법을 쓰거나 ask_user 로 물어보세요' +
        '\n[사용자 확인] 같은 순서를 반복하지 않는다. 사용자 답: 다른 방법으로 계속',
    );
    expect(ctx.repeatTracker.actionList).toEqual([]);
    expect(ctx.stopByUser).not.toHaveBeenCalled();
  });

  it('읽기 도구(snapshot)는 묶음 순서에 넣지 않는다', async () => {
    const { ctx } = createContext(answerOf('x'));
    await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: '화면' });
    expect(ctx.repeatTracker.actionList).toEqual([]);
  });

  it('차단 문구면 직접 진행 질문을 하고, 멈추기면 stopByUser 를 부른다', async () => {
    const { ctx, requestList, questionTextList } = createContext(answerOf(HANDOVER_OPTION.blockStop));
    const result = await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: BLOCK_TEXT });
    expect(questionTextList()[0]).toContain('자동 조작을 막는 화면');
    expect(requestList[0]).toMatchObject({
      kind: 'question',
      question: { optionList: [HANDOVER_OPTION.blockStop, HANDOVER_OPTION.blockResolved] },
    });
    expect(result).toContain('[사용자 확인] 사용자가 멈추기를 골랐습니다');
    expect(ctx.stopByUser).toHaveBeenCalledOnce();
  });

  it('질문 step 은 ask_user 로 남고 waiting → ok(답 원문 생략) 로 끝난다', async () => {
    const { ctx } = createContext(answerOf(HANDOVER_OPTION.blockResolved));
    await annotateWithHandover(ctx, { tool: 'read_text', summary: '글 읽기', value: BLOCK_TEXT });
    expect(ctx.beginStep).toHaveBeenCalledWith(expect.objectContaining({ tool: 'ask_user' }));
    expect(vi.mocked(ctx.endStep).mock.calls).toEqual([
      [1, 'waiting', '사용자 답 대기'],
      [1, 'ok', '[답변 생략]'],
    ]);
  });

  it('같은 페이지·같은 문구는 한 번만 묻고, 다른 페이지면 다시 묻는다', async () => {
    const { ctx, questionTextList } = createContext(answerOf(HANDOVER_OPTION.blockResolved));
    await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: BLOCK_TEXT });
    await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: BLOCK_TEXT });
    expect(questionTextList()).toHaveLength(1);
    vi.mocked(ctx.driver.getPageInfo).mockResolvedValue({ url: 'https://k.com/b', title: '' });
    await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: BLOCK_TEXT });
    expect(questionTextList()).toHaveLength(2);
  });

  it('질문 중 중지되면(cancelled) 아무것도 붙이지 않고 step 을 ok 로 닫지 않는다', async () => {
    const { ctx } = createContext({ type: 'cancelled', reason: 'stopped' });
    const result = await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: BLOCK_TEXT });
    expect(result).toBe(BLOCK_TEXT);
    expect(ctx.endStep).not.toHaveBeenCalledWith(1, 'ok', expect.anything());
    expect(ctx.stopByUser).not.toHaveBeenCalled();
  });

  it('긴 질문은 300자에서 자른다', async () => {
    const { ctx, questionTextList } = createContext(answerOf(HANDOVER_OPTION.blockResolved));
    const longLine = `- paragraph: ${'가'.repeat(200)} 보안문자 ${'나'.repeat(200)}`;
    await annotateWithHandover(ctx, { tool: 'snapshot', summary: '페이지 읽기', value: longLine });
    expect(questionTextList()[0]?.length).toBeLessThanOrEqual(300);
  });
});
