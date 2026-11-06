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

const WAIT_SCENARIO: TFakeScenario = {
  turns: [
    { content: [{ type: 'tool_use', name: 'wait_user', input: {} }] },
    { content: [{ type: 'text', text: '끝' }] },
  ],
};

function baseOptions(client: Anthropic) {
  return {
    client,
    model: 'claude-opus-5-5',
    systemPrompt: '시스템',
    firstUserMessage: '할 일: 테스트',
    signal: new AbortController().signal,
  };
}

/** 사용자 대기처럼 밖에서 풀어 주는 문 */
function createGate() {
  let resolve: (text: string) => void = () => undefined;
  let isStarted = false;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve, isStarted: () => isStarted, markStarted: () => (isStarted = true) };
}

/** run 이 문이 열릴 때까지 기다리는 도구 — 서비스의 승인 대기(waitForUser)와 같은 모양 */
function createWaitingTool(gate: ReturnType<typeof createGate>) {
  return betaZodTool({
    name: 'wait_user',
    description: 'wait for the user',
    inputSchema: z.strictObject({}),
    run: async () => {
      gate.markStarted();
      return gate.promise;
    },
  });
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

  it('도구 run 이 오래 기다려도(승인 대기) 결과가 나오기 전에는 다음 모델 요청을 보내지 않는다', async () => {
    const gate = createGate();
    const { client, requestList } = createClient(WAIT_SCENARIO);
    const promise = runAgentLoop({ ...baseOptions(client), tools: [createWaitingTool(gate)] });
    await vi.waitFor(() => expect(gate.isStarted()).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestList).toHaveLength(1);
    gate.resolve('사용자가 승인함');
    expect(await promise).toEqual({ kind: 'done', summary: '끝' });
    expect(requestList).toHaveLength(2);
  });

  it('대기 중 abort 하고 대기가 풀리면 다음 요청 없이 aborted 로 끝난다', async () => {
    const gate = createGate();
    const controller = new AbortController();
    const { client, requestList } = createClient(WAIT_SCENARIO);
    const promise = runAgentLoop({
      ...baseOptions(client),
      tools: [createWaitingTool(gate)],
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(gate.isStarted()).toBe(true));
    controller.abort();
    gate.resolve('stopped: 실행이 멈춰 도구를 실행하지 않았습니다');
    expect(await promise).toEqual({ kind: 'aborted' });
    expect(requestList).toHaveLength(1);
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

describe('runAgentLoop — 프로필 요청 옵션 (spec 007)', () => {
  /** 가짜 fetch 앞에서 anthropic-beta 헤더를 기록한다 */
  function createBetaRecordingClient() {
    const fake = createFakeFetch({ turns: [{ content: [{ type: 'text', text: '끝' }] }] });
    const betaHeaderList: string[] = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      betaHeaderList.push(new Headers(init?.headers).get('anthropic-beta') ?? '');
      return fake.fetch(input, init);
    };
    return { client: new Anthropic({ apiKey: 'fake', fetch }), requestList: fake.requestList, betaHeaderList };
  }

  it('request 를 주지 않으면 fallbacks 와 두 베타를 보낸다', async () => {
    const { client, requestList, betaHeaderList } = createBetaRecordingClient();
    await runAgentLoop({ ...baseOptions(client), tools: [createEchoTool().tool] });
    expect(requestList[0]).toMatchObject({ fallbacks: 'default' });
    expect(betaHeaderList[0]).toContain('server-side-fallback-2026-07-01');
    expect(betaHeaderList[0]).toContain('context-management-2025-06-27');
  });

  it('hasFallbacks false·베타 1개면 fallbacks 와 server-side-fallback 베타를 보내지 않는다', async () => {
    const { client, requestList, betaHeaderList } = createBetaRecordingClient();
    await runAgentLoop({
      ...baseOptions(client),
      tools: [createEchoTool().tool],
      request: { betaList: ['context-management-2025-06-27'], hasFallbacks: false },
    });
    expect(requestList[0]).not.toHaveProperty('fallbacks');
    expect(betaHeaderList[0]).not.toContain('server-side-fallback');
    expect(betaHeaderList[0]).toContain('context-management-2025-06-27');
  });
});

describe('runAgentLoop — API 오류 상태 전달 (spec 005 FR-6)', () => {
  it.each([401, 402, 429])('HTTP %i 오류면 failed 에 apiStatus 를 싣는다', async (status) => {
    const fetch = async () => Response.json({ type: 'error', error: { type: 'x', message: 'x' } }, { status });
    const client = new Anthropic({ apiKey: 'fake', fetch, maxRetries: 0 });
    const outcome = await runAgentLoop({ ...baseOptions(client), tools: [createEchoTool().tool] });
    expect(outcome).toMatchObject({ kind: 'failed', apiStatus: status });
  });
});
