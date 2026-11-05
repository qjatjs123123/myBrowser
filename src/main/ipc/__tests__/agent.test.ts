import { describe, expect, it, vi } from 'vitest';

import { IPC } from '@shared/ipc/channels';

import { AGENT_MESSAGE, type IAgentService } from '../../agent/service';
import { createAgentHandlers } from '../handlers/agent';

function setup(startResult: Awaited<ReturnType<IAgentService['start']>> = { ok: true, runId: 'run-1' }) {
  const service = {
    start: vi.fn(async () => startResult),
    stop: vi.fn((runId: string) => runId === 'run-1'),
  } satisfies IAgentService;
  return { service, handlers: createAgentHandlers(service) };
}

describe('agent:start 핸들러', () => {
  it('유효한 요청이면 공백을 다듬은 task 로 서비스를 부르고 runId 성공 봉투를 돌려준다', async () => {
    const { service, handlers } = setup();
    expect(await handlers[IPC.agent.start]({ task: '  예약해줘 ' })).toEqual({ ok: true, data: { runId: 'run-1' } });
    expect(service.start).toHaveBeenCalledWith('예약해줘');
  });

  it.each([undefined, {}, { task: '   ' }, { task: 'a'.repeat(2001) }, { task: '할 일', extra: 1 }])(
    '형식이 틀린 요청(%j)이면 INVALID_INPUT 이고 서비스를 부르지 않는다',
    async (raw) => {
      const { service, handlers } = setup();
      expect(await handlers[IPC.agent.start](raw)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다' },
      });
      expect(service.start).not.toHaveBeenCalled();
    },
  );

  it('실행 중이면 BUSY 봉투다', async () => {
    const { handlers } = setup({ ok: false, code: 'BUSY', message: AGENT_MESSAGE.busy });
    expect(await handlers[IPC.agent.start]({ task: '할 일' })).toEqual({
      ok: false,
      error: { code: 'BUSY', message: '이미 실행 중인 작업이 있습니다' },
    });
  });

  it('API 키가 없으면 FR-8 문장의 AGENT_ERROR 봉투다', async () => {
    const { handlers } = setup({ ok: false, code: 'AGENT_ERROR', message: AGENT_MESSAGE.missingApiKey });
    expect(await handlers[IPC.agent.start]({ task: '할 일' })).toEqual({
      ok: false,
      error: {
        code: 'AGENT_ERROR',
        message: 'API 키가 없습니다. .env 에 ANTHROPIC_API_KEY 를 넣고 앱을 다시 켜 주세요',
      },
    });
  });

  it('CDP 연결에 실패하면 “브라우저 제어 연결에 실패했습니다” AGENT_ERROR 봉투다', async () => {
    const { handlers } = setup({ ok: false, code: 'AGENT_ERROR', message: AGENT_MESSAGE.driverFailed });
    expect(await handlers[IPC.agent.start]({ task: '할 일' })).toEqual({
      ok: false,
      error: { code: 'AGENT_ERROR', message: '브라우저 제어 연결에 실패했습니다' },
    });
  });
});

describe('agent:stop 핸들러', () => {
  it('실행 중인 run 이면 null 성공 봉투다', () => {
    const { service, handlers } = setup();
    expect(handlers[IPC.agent.stop]({ runId: 'run-1' })).toEqual({ ok: true, data: null });
    expect(service.stop).toHaveBeenCalledWith('run-1');
  });

  it('없거나 끝난 runId 면 NOT_FOUND 봉투다', () => {
    const { handlers } = setup();
    expect(handlers[IPC.agent.stop]({ runId: 'run-x' })).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: '실행 중인 작업을 찾을 수 없습니다' },
    });
  });

  it('형식이 틀리면 INVALID_INPUT 이고 서비스를 부르지 않는다', () => {
    const { service, handlers } = setup();
    expect(handlers[IPC.agent.stop]({ runId: '' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(service.stop).not.toHaveBeenCalled();
  });
});
