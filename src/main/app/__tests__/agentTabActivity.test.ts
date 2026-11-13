import { describe, expect, it, vi } from 'vitest';

import type { TAgentEvent } from '@shared/ipc/agent';

import { createAgentTabActivity } from '../agentTabActivity';

const RUN_ID = 'run-1';

function statusEvent(status: Extract<TAgentEvent, { type: 'status' }>['status']): TAgentEvent {
  return { type: 'status', runId: RUN_ID, status };
}

function setup() {
  const setActivity = vi.fn();
  const activity = createAgentTabActivity({ setActivity });
  const port = { activate: vi.fn(), create: vi.fn((_url?: string) => 'tab-9'), list: vi.fn() };
  return { activity, setActivity, port, wrapped: activity.wrapTabsPort(port) };
}

describe('createAgentTabActivity', () => {
  it('run 을 시작하면 시작 탭을 작업 중으로 표시한다', () => {
    const { activity, setActivity } = setup();
    activity.startRun('tab-1');
    expect(setActivity).toHaveBeenLastCalledWith('tab-1', 'working');
  });

  it('waiting_user 면 응답 대기로 바꾼다', () => {
    const { activity, setActivity } = setup();
    activity.startRun('tab-1');
    activity.handleEvent(statusEvent('waiting_user'));
    expect(setActivity).toHaveBeenLastCalledWith('tab-1', 'waiting');
  });

  it('running 으로 돌아오면 작업 중으로 바꾼다', () => {
    const { activity, setActivity } = setup();
    activity.startRun('tab-1');
    activity.handleEvent(statusEvent('waiting_user'));
    activity.handleEvent(statusEvent('running'));
    expect(setActivity).toHaveBeenLastCalledWith('tab-1', 'working');
  });

  it.each(['done', 'failed', 'stopped', 'stopped_before_confirm'] as const)('%s 면 표시를 지운다', (status) => {
    const { activity, setActivity } = setup();
    activity.startRun('tab-1');
    activity.handleEvent(statusEvent(status));
    expect(setActivity).toHaveBeenLastCalledWith(null, null);
  });

  it('탭을 전환하면 표시가 그 탭으로 옮겨진다', () => {
    const { activity, setActivity, wrapped, port } = setup();
    activity.startRun('tab-1');
    wrapped.activate('tab-2');
    expect(port.activate).toHaveBeenCalledWith('tab-2');
    expect(setActivity).toHaveBeenLastCalledWith('tab-2', 'working');
  });

  it('새 탭을 열면 표시가 새 탭으로 옮겨지고 id 를 그대로 돌려준다', () => {
    const { activity, setActivity, wrapped } = setup();
    activity.startRun('tab-1');
    expect(wrapped.create('https://a.com/')).toBe('tab-9');
    expect(setActivity).toHaveBeenLastCalledWith('tab-9', 'working');
  });

  it('run 이 끝난 뒤 탭을 전환해도 표시하지 않는다', () => {
    const { activity, setActivity, wrapped } = setup();
    activity.startRun('tab-1');
    activity.handleEvent(statusEvent('done'));
    setActivity.mockClear();
    wrapped.activate('tab-2');
    expect(setActivity).not.toHaveBeenCalled();
  });

  it('status 가 아닌 이벤트는 무시한다', () => {
    const { activity, setActivity } = setup();
    activity.startRun('tab-1');
    setActivity.mockClear();
    activity.handleEvent({ type: 'done', runId: RUN_ID, summary: '끝' });
    expect(setActivity).not.toHaveBeenCalled();
  });

  it('감싼 포트는 다른 메서드를 그대로 둔다', () => {
    const { wrapped, port } = setup();
    expect(wrapped.list).toBe(port.list);
  });
});
