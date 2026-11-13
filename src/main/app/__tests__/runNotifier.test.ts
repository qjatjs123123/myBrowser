import { describe, expect, it, vi } from 'vitest';

import type { TAgentEvent } from '@shared/ipc/agent';

import { createRunNotifier, NOTIFICATION_BODY_MAX, toRunNotification } from '../runNotifier';

const RUN_ID = 'run-1';

function approvalEvent(display: { action: string; target: string }): TAgentEvent {
  return {
    type: 'approval_required',
    runId: RUN_ID,
    request: { requestId: 'req-1', stepN: 3, kind: 'guard', source: 'structure', reason: '확정', display, modelNote: null },
  };
}

describe('toRunNotification', () => {
  it('승인 요청이면 동작과 대상을 본문으로 쓴다', () => {
    expect(toRunNotification(approvalEvent({ action: '클릭', target: '예약 확정' }))).toEqual({
      title: '승인이 필요합니다',
      body: '클릭 — 예약 확정',
    });
  });

  it('대상이 빈 승인 요청이면 동작만 쓴다', () => {
    expect(toRunNotification(approvalEvent({ action: '확인 요청', target: '' }))?.body).toBe('확인 요청');
  });

  it('질문이면 질문 문장을 쓴다', () => {
    const event: TAgentEvent = {
      type: 'question',
      runId: RUN_ID,
      question: { requestId: 'req-2', stepN: 2, text: '몇 시로 할까요?', optionList: [] },
    };
    expect(toRunNotification(event)).toEqual({ title: '에이전트 질문', body: '몇 시로 할까요?' });
  });

  it('완료면 요약을 쓴다', () => {
    expect(toRunNotification({ type: 'done', runId: RUN_ID, summary: '예약 직전에 멈췄습니다' })).toEqual({
      title: '작업을 마쳤습니다',
      body: '예약 직전에 멈췄습니다',
    });
  });

  it('실패면 이유를 쓴다', () => {
    expect(toRunNotification({ type: 'failed', runId: RUN_ID, reason: '연결 끊김' })).toEqual({
      title: '작업이 실패했습니다',
      body: '연결 끊김',
    });
  });

  it.each<TAgentEvent>([
    { type: 'stopped', runId: RUN_ID },
    { type: 'status', runId: RUN_ID, status: 'running' },
    { type: 'question_answered', runId: RUN_ID, requestId: 'req-2' },
    { type: 'step', runId: RUN_ID, step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' } },
  ])('알릴 이벤트가 아니면 null 이다 (%o)', (event) => {
    expect(toRunNotification(event)).toBeNull();
  });

  it('본문이 길면 120자로 자르고 … 를 붙인다', () => {
    const body = toRunNotification({ type: 'done', runId: RUN_ID, summary: '가'.repeat(200) })?.body ?? '';
    expect(body).toHaveLength(NOTIFICATION_BODY_MAX);
    expect(body.endsWith('…')).toBe(true);
  });
});

describe('createRunNotifier', () => {
  function setup(isFocused: boolean) {
    const show = vi.fn();
    const focusWindow = vi.fn();
    const isWindowFocused = vi.fn(() => isFocused);
    return { show, focusWindow, isWindowFocused, notifier: createRunNotifier({ isWindowFocused, show, focusWindow }) };
  }

  it('창에 포커스가 없으면 알린다', () => {
    const { show, notifier } = setup(false);
    notifier.handleEvent({ type: 'done', runId: RUN_ID, summary: '끝' });
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ title: '작업을 마쳤습니다', body: '끝' }));
  });

  it('창에 포커스가 있으면 알리지 않는다', () => {
    const { show, notifier } = setup(true);
    notifier.handleEvent({ type: 'done', runId: RUN_ID, summary: '끝' });
    expect(show).not.toHaveBeenCalled();
  });

  it('알림을 누르면 창에 포커스한다', () => {
    const { show, focusWindow, notifier } = setup(false);
    notifier.handleEvent({ type: 'failed', runId: RUN_ID, reason: '실패' });
    const { onClick } = show.mock.calls[0]?.[0] as { onClick: () => void };
    onClick();
    expect(focusWindow).toHaveBeenCalled();
  });

  it('포커스 여부는 알림마다 다시 읽는다', () => {
    const { isWindowFocused, notifier } = setup(false);
    notifier.handleEvent({ type: 'done', runId: RUN_ID, summary: '1' });
    notifier.handleEvent({ type: 'done', runId: RUN_ID, summary: '2' });
    expect(isWindowFocused).toHaveBeenCalledTimes(2);
  });
});
