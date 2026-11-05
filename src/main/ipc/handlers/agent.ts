import {
  StartAgentRequestSchema,
  StartAgentResponseSchema,
  StopAgentRequestSchema,
  type TStartAgentResponse,
} from '@shared/ipc/agent';
import { IPC } from '@shared/ipc/channels';
import { fail, ok, type TIpcResult } from '@shared/ipc/result';
import { EmptyResponseSchema } from '@shared/ipc/tabs';

import type { IAgentService } from '../../agent/service';

const INVALID_MESSAGE = '요청 형식이 올바르지 않습니다';
const NOT_FOUND_MESSAGE = '실행 중인 작업을 찾을 수 없습니다';

/**
 * [agent 핸들러] agent:start·agent:stop — safeParse → AgentService → 봉투.
 * BUSY·AGENT_ERROR 문장은 서비스가 정한 것을 그대로 쓴다 (spec 003 「IPC 계약」 실패 봉투).
 * 규칙: .claude/rules/electron/ipc.md 「핸들러」 — 로직은 서비스에
 */
export function createAgentHandlers(service: Pick<IAgentService, 'start' | 'stop'>) {
  return {
    [IPC.agent.start]: (raw: unknown) => startAgent(service, raw),
    [IPC.agent.stop]: (raw: unknown) => stopAgent(service, raw),
  };
}

async function startAgent(
  service: Pick<IAgentService, 'start'>,
  raw: unknown,
): Promise<TIpcResult<TStartAgentResponse>> {
  const parsed = StartAgentRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  const result = await service.start(parsed.data.task);
  if (!result.ok) return fail(result.code, result.message);
  return ok(StartAgentResponseSchema.parse({ runId: result.runId }));
}

function stopAgent(service: Pick<IAgentService, 'stop'>, raw: unknown): TIpcResult<null> {
  const parsed = StopAgentRequestSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID_INPUT', INVALID_MESSAGE, parsed.error.issues);
  if (!service.stop(parsed.data.runId)) return fail('NOT_FOUND', NOT_FOUND_MESSAGE);
  return ok(EmptyResponseSchema.parse(null));
}
