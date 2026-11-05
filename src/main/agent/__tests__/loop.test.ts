import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { TFakeScenario } from '@shared/agent/fakeScenario';

import { createFakeFetch } from '../fake/fakeFetch';
import { runAgentLoop } from '../loop';

/** 실제 SDK 클라이언트 + 가짜 fetch — 네트워크·실제 API 없음 */
function createClient(scenario: TFakeScenario) {
  const fake = createFakeFetch(scenario);
  return { client: new Anthropic({ apiKey: 'fake', fetch: fake.fetch }), requestList: fake.requestList };
}

/** 호출을 기록하는 echo 도구 */
function createEchoTool() {
  const run = vi.fn(async ({ word }: { word: string }) => `echo: ${word}`);
  const tool = betaZodTool({
    name: 'echo',
    description: 'echo the word',
    inputSchema: z.strictObject({ word: z.string() }),
    run,
    eager_input_streaming: true,
  });
  return { tool, run };
}

async function runWith(scenario: TFakeScenario, signal = new AbortController().signal) {
  const { client, requestList } = createClient(scenario);
  const { tool, run } = createEchoTool();
  const outcome = await runAgentLoop({
    client,
    model: 'claude-opus-5-5',
    tools: [tool],
    systemPrompt: '시스템',
    firstUserMessage: '할 일: 테스트',
    signal,
  });
  return { outcome, run, requestList };
}

describe('runAgentLoop', () => {
  it('tool_use 다음 end_turn 이면 도구를 실행하고 마지막 text 를 요약으로 끝낸다', async () => {
    const { outcome, run, requestList } = await runWith({
      turns: [
        { content: [{ type: 'tool_use', name: 'echo', input: { word: '안녕' } }] },
        { content: [{ type: 'text', text: '끝났습니다' }] },
      ],
    });
    expect(outcome).toEqual({ kind: 'done', summary: '끝났습니다' });
    expect(run).toHaveBeenCalledOnce();
    expect(requestList).toHaveLength(2);
  });

  it('요청에 thinking·temperature 를 보내지 않고 스트리밍·effort·fallback·캐싱을 보낸다', async () => {
    const { requestList } = await runWith({ turns: [{ content: [{ type: 'text', text: '끝' }] }] });
    const body = requestList[0] ?? {};
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('temperature');
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      output_config: { effort: 'high' },
      fallbacks: 'default',
      system: [{ type: 'text', text: '시스템', cache_control: { type: 'ephemeral' } }],
    });
  });

  it('stop_reason 이 max_tokens 이면 그 턴의 도구를 실행하지 않고 failed 로 끝낸다', async () => {
    const { outcome, run } = await runWith({
      turns: [{ content: [{ type: 'tool_use', name: 'echo', input: { word: '잘림' } }], stop_reason: 'max_tokens' }],
    });
    expect(outcome.kind).toBe('failed');
    expect(run).not.toHaveBeenCalled();
  });

  it('stop_reason 이 refusal 이면 분류를 이유에 담아 failed 로 끝낸다', async () => {
    const { outcome } = await runWith({
      turns: [{ content: [{ type: 'text', text: '거절' }], stop_reason: 'refusal' }],
    });
    expect(outcome).toEqual({ kind: 'failed', reason: expect.stringContaining('general_harms') });
  });

  it('이미 abort 된 signal 이면 요청 없이 aborted 로 끝낸다', async () => {
    const controller = new AbortController();
    controller.abort();
    const { outcome, requestList } = await runWith(
      { turns: [{ content: [{ type: 'text', text: '끝' }] }] },
      controller.signal,
    );
    expect(outcome).toEqual({ kind: 'aborted' });
    expect(requestList).toHaveLength(0);
  });
});
