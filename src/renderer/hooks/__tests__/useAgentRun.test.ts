import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TAgentEvent, TStartAgentResponse } from '@shared/ipc/agent';
import type { TIpcResult } from '@shared/ipc/result';

import { useAgentRun } from '../useAgentRun';

/** onEvent 에 넘겨진 콜백을 꺼낸다 */
function getEventListener(): (event: TAgentEvent) => void {
  const listener = vi.mocked(window.api.agent.onEvent).mock.calls[0]?.[0];
  if (!listener) throw new Error('onEvent 가 구독되지 않았습니다');
  return listener;
}

/** run-1 로 시작한 훅을 돌려준다 */
async function renderStartedHook() {
  vi.mocked(window.api.agent.start).mockResolvedValue({ ok: true, data: { runId: 'run-1' } });
  const hook = renderHook(() => useAgentRun());
  await act(async () => {
    await hook.result.current.start('할 일');
  });
  return hook;
}

describe('useAgentRun', () => {
  it('start 가 성공하면 runId 와 running 상태를 세운다', async () => {
    const { result } = await renderStartedHook();
    expect(window.api.agent.start).toHaveBeenCalledWith({ task: '할 일' });
    expect(result.current.runId).toBe('run-1');
    expect(result.current.status).toBe('running');
    expect(result.current.stepList).toEqual([]);
    expect(result.current.result).toBeNull();
  });

  it('계약 순서의 이벤트를 차례로 반영한다', async () => {
    const { result } = await renderStartedHook();
    const emit = getEventListener();
    act(() => {
      emit({ type: 'status', runId: 'run-1', status: 'running' });
      emit({
        type: 'step',
        runId: 'run-1',
        step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'running' },
      });
      emit({ type: 'step', runId: 'run-1', step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' } });
      emit({ type: 'done', runId: 'run-1', summary: '전화 02-123-4567' });
      emit({ type: 'status', runId: 'run-1', status: 'done' });
    });
    expect(result.current.stepList).toEqual([{ n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' }]);
    expect(result.current.result).toEqual({ kind: 'done', text: '전화 02-123-4567' });
    expect(result.current.status).toBe('done');
  });

  it('start 응답 전에 온 같은 runId 이벤트도 순서대로 반영한다', async () => {
    let resolveStart: (value: TIpcResult<TStartAgentResponse>) => void = () => {};
    vi.mocked(window.api.agent.start).mockReturnValue(new Promise((resolve) => (resolveStart = resolve)));
    const { result } = renderHook(() => useAgentRun());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.start('할 일');
    });
    const emit = getEventListener();
    act(() => {
      emit({ type: 'status', runId: 'run-1', status: 'running' });
      emit({
        type: 'step',
        runId: 'run-1',
        step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'running' },
      });
      emit({ type: 'step', runId: 'run-other', step: { n: 1, tool: 'click', summary: '남의 것', status: 'ok' } });
    });
    await act(async () => {
      resolveStart({ ok: true, data: { runId: 'run-1' } });
      await pending;
    });
    expect(result.current.stepList).toEqual([{ n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'running' }]);
    expect(result.current.status).toBe('running');
  });

  it('start 응답 전에 run 이 끝났으면 종료 상태가 running 으로 덮이지 않는다', async () => {
    let resolveStart: (value: TIpcResult<TStartAgentResponse>) => void = () => {};
    vi.mocked(window.api.agent.start).mockReturnValue(new Promise((resolve) => (resolveStart = resolve)));
    const { result } = renderHook(() => useAgentRun());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.start('할 일');
    });
    act(() => {
      getEventListener()({ type: 'failed', runId: 'run-1', reason: '모델 응답을 해석하지 못했습니다' });
      getEventListener()({ type: 'status', runId: 'run-1', status: 'failed' });
    });
    await act(async () => {
      resolveStart({ ok: true, data: { runId: 'run-1' } });
      await pending;
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.result).toEqual({ kind: 'failed', text: '모델 응답을 해석하지 못했습니다' });
  });

  it('다른 runId 의 이벤트는 무시한다', async () => {
    const { result } = await renderStartedHook();
    act(() => {
      getEventListener()({ type: 'status', runId: 'run-2', status: 'failed' });
      getEventListener()({ type: 'step', runId: 'run-2', step: { n: 1, tool: 'click', summary: 'x', status: 'ok' } });
    });
    expect(result.current.status).toBe('running');
    expect(result.current.stepList).toEqual([]);
  });

  it('같은 n 의 step 은 교체하고 새 n 은 순서대로 추가한다', async () => {
    const { result } = await renderStartedHook();
    const emit = getEventListener();
    act(() => {
      emit({
        type: 'step',
        runId: 'run-1',
        step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'running' },
      });
      emit({ type: 'step', runId: 'run-1', step: { n: 2, tool: 'click', summary: '클릭', status: 'running' } });
      emit({ type: 'step', runId: 'run-1', step: { n: 1, tool: 'snapshot', summary: '페이지 읽기', status: 'ok' } });
    });
    expect(result.current.stepList.map((step) => [step.n, step.status])).toEqual([
      [1, 'ok'],
      [2, 'running'],
    ]);
  });

  it('stopped 이벤트면 “중지했습니다” 결과를 만든다', async () => {
    const { result } = await renderStartedHook();
    act(() => getEventListener()({ type: 'stopped', runId: 'run-1' }));
    expect(result.current.result).toEqual({ kind: 'stopped', text: '중지했습니다' });
  });

  it('guard_stopped 이벤트면 display 의 행동·대상을 담은 결과를 만든다', async () => {
    const { result } = await renderStartedHook();
    act(() =>
      getEventListener()({
        type: 'guard_stopped',
        runId: 'run-1',
        reason: '확정 버튼',
        display: { action: '클릭', target: '예약 확정' },
      }),
    );
    expect(result.current.result).toEqual({
      kind: 'guard_stopped',
      text: '확정 직전에 멈췄습니다 — 클릭: 예약 확정. 직접 확인하고 누르세요',
    });
  });

  it('start 가 실패 봉투면 그대로 돌려주고 run 을 세우지 않는다', async () => {
    const envelope = { ok: false, error: { code: 'BUSY', message: '이미 실행 중인 작업이 있습니다' } } as const;
    vi.mocked(window.api.agent.start).mockResolvedValue(envelope);
    const { result } = renderHook(() => useAgentRun());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.start('할 일');
    });
    expect(returned).toEqual(envelope);
    expect(result.current.runId).toBeNull();
    expect(result.current.status).toBeNull();
  });

  it('stop 은 현재 runId 로 agent.stop 을 부르고 봉투를 돌려준다', async () => {
    const { result } = await renderStartedHook();
    vi.mocked(window.api.agent.stop).mockResolvedValue({ ok: true, data: null });
    const returned = await result.current.stop();
    expect(window.api.agent.stop).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(returned).toEqual({ ok: true, data: null });
  });

  it('run 이 없을 때 stop 은 agent.stop 을 부르지 않고 NOT_FOUND 를 돌려준다', async () => {
    const { result } = renderHook(() => useAgentRun());
    const returned = await result.current.stop();
    expect(window.api.agent.stop).not.toHaveBeenCalled();
    expect(returned).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: '실행 중인 작업을 찾을 수 없습니다' } });
  });

  it('언마운트하면 구독을 해제한다', () => {
    const { unmount } = renderHook(() => useAgentRun());
    const unsubscribe = vi.mocked(window.api.agent.onEvent).mock.results[0]?.value as ReturnType<typeof vi.fn>;
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
