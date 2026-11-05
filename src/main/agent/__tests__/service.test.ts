import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import type { IRunStore, TRunRecord, TStepRecord, TStepUpsert } from '@shared/agent/run';
import type { TFakeScenario, TFakeTurn } from '@shared/agent/fakeScenario';
import { AgentEventSchema, type TAgentEvent } from '@shared/ipc/agent';
import type { IBrowserDriver, IGuardTarget, TActionResult } from '@shared/tools';

import { createFakeFetch, type TFakeRequestBody } from '../fake/fakeFetch';
import { GUARD_MESSAGE } from '../guard';
import { MissingApiKeyError } from '../modelClient';
import { AGENT_MESSAGE, createAgentService, type IAgentServiceDeps } from '../service';

const SNAPSHOT_TEXT = [
  'URL: https://shop.example.com/ / 제목: 가게',
  '- link "두 번째 페이지" [ref=e2]',
  '- button "예약 확정" [ref=e3]',
  '- textbox "비밀번호" [ref=e4]',
  '- searchbox "검색어" [ref=e5]',
].join('\n');

const TARGET_MAP: Record<string, Partial<IGuardTarget>> = {
  e2: { role: 'link', name: '두 번째 페이지', href: 'https://shop.example.com/second' },
  e3: { role: 'button', name: '예약 확정' },
  e4: { role: 'textbox', name: '비밀번호', inputType: 'password' },
  e5: { role: 'searchbox', name: '검색어', inputType: 'search' },
};

const FINAL_STATUS_LIST = ['done', 'failed', 'stopped', 'stopped_before_confirm'];
const TERMINAL_TYPE_LIST = ['done', 'failed', 'stopped', 'guard_stopped'];

function toTarget(patch: Partial<IGuardTarget>): IGuardTarget {
  const empty = { role: '', name: '', text: '', value: '', href: '', formAction: '', formSubmitText: '' };
  const field = { inputType: '', autocomplete: '', fieldName: '', label: '' };
  return { ...empty, ...field, pageUrl: 'https://shop.example.com/', ...patch };
}

const ok = (text: string): Promise<TActionResult> => Promise.resolve({ ok: true, text });

/** vi.fn 으로 만든 가짜 IBrowserDriver */
function createFakeDriver() {
  return {
    snapshot: vi.fn(() => ok(SNAPSHOT_TEXT)),
    readText: vi.fn(() => ok('전화 02-123-4567')),
    navigate: vi.fn(() => ok('이동함')),
    goBack: vi.fn(() => ok('뒤로 감')),
    click: vi.fn(() => ok('클릭함')),
    typeText: vi.fn(() => ok('입력함')),
    selectOption: vi.fn(() => ok('선택함')),
    pressKey: vi.fn(() => ok('눌렀음')),
    scroll: vi.fn(() => ok('스크롤함')),
    waitFor: vi.fn(() => ok('기다림')),
    listTabs: vi.fn(() => ok('t1* 가게 — https://shop.example.com/')),
    switchTab: vi.fn(() => ok('전환함')),
    openTab: vi.fn(() => ok('새 탭: t2')),
    resolveTarget: vi.fn(async ({ ref }: { ref?: string }) =>
      ref && TARGET_MAP[ref] ? toTarget(TARGET_MAP[ref]) : null,
    ),
    getPageInfo: vi.fn(async () => ({ url: 'https://shop.example.com/', title: '가게' })),
    dispose: vi.fn(async () => undefined),
  } satisfies IBrowserDriver;
}

/** 메모리 IRunStore — 호출 인자를 모두 기록한다 */
function createMemoryStore() {
  const runMap = new Map<string, TRunRecord>();
  const stepMap = new Map<string, Map<number, TStepRecord>>();
  const callList: unknown[] = [];
  const store: IRunStore = {
    createRun: (run) => {
      callList.push(['createRun', run]);
      runMap.set(run.id, { ...run, summary: null, reason: null, endedAt: null });
    },
    updateRun: (id, patch) => {
      callList.push(['updateRun', id, patch]);
      const run = runMap.get(id);
      if (run) runMap.set(id, { ...run, ...patch });
    },
    upsertStep: (runId, step: TStepUpsert) => {
      callList.push(['upsertStep', runId, step]);
      const map = stepMap.get(runId) ?? new Map<number, TStepRecord>();
      map.set(step.n, { ...step, resultText: step.resultText ?? null });
      stepMap.set(runId, map);
    },
    getRun: (id) => runMap.get(id) ?? null,
    listSteps: (runId) => [...(stepMap.get(runId)?.values() ?? [])].sort((a, b) => a.n - b.n),
  };
  return { store, callList };
}

interface ISetupOptions {
  scenario?: TFakeScenario;
  deps?: Partial<IAgentServiceDeps>;
  driver?: ReturnType<typeof createFakeDriver>;
}

function setup({ scenario = { turns: [] }, deps = {}, driver = createFakeDriver() }: ISetupOptions = {}) {
  const fake = createFakeFetch(scenario);
  const { store, callList } = createMemoryStore();
  const eventList: TAgentEvent[] = [];
  const log = { error: vi.fn() };
  let idCount = 0;
  const service = createAgentService({
    createModelClient: () => new Anthropic({ apiKey: 'fake', fetch: fake.fetch, maxRetries: 0 }),
    createDriver: async () => driver,
    runStore: store,
    emit: (event) => eventList.push(AgentEventSchema.parse(event)),
    now: () => new Date(2026, 10, 5, 9, 0),
    createId: () => `run-${++idCount}`,
    guardOptions: { allowedHostList: [] },
    model: 'claude-opus-5-5',
    maxToolCalls: 60,
    log,
    ...deps,
  });
  const waitForEnd = async () => {
    await vi.waitFor(() => {
      expect(eventList.some((e) => e.type === 'status' && FINAL_STATUS_LIST.includes(e.status))).toBe(true);
      expect(driver.dispose).toHaveBeenCalled();
    });
  };
  return { service, driver, store, callList, eventList, log, requestList: fake.requestList, waitForEnd };
}

const toolTurn = (name: string, input: Record<string, unknown> = {}): TFakeTurn => ({
  content: [{ type: 'tool_use', name, input }],
});
const textTurn = (text: string): TFakeTurn => ({ content: [{ type: 'text', text }] });

/** 이벤트를 비교하기 쉬운 문자열로 */
function toEventKeyList(eventList: TAgentEvent[]): string[] {
  return eventList.map((e) => {
    if (e.type === 'status') return `status:${e.status}`;
    if (e.type === 'step') return `step:${e.step.n}:${e.step.status}`;
    return e.type;
  });
}

/** 요청 본문의 마지막 user 메시지에 담긴 tool_result 목록 */
function getLastToolResultList(requestList: TFakeRequestBody[]): Record<string, unknown>[] {
  const messageList = requestList.at(-1)?.messages ?? [];
  const last = messageList.at(-1) as { content?: unknown } | undefined;
  return Array.isArray(last?.content) ? (last.content as Record<string, unknown>[]) : [];
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('AgentService — 정상 흐름 ①', () => {
  const scenario = {
    turns: [
      toolTurn('snapshot'),
      toolTurn('click', { ref: '$ref(link:두 번째 페이지)' }),
      textTurn('전화번호는 02-123-4567 입니다'),
    ],
  };

  it('snapshot → click → end_turn 이면 계약 순서대로 이벤트를 보낸다', async () => {
    const t = setup({ scenario });
    const result = await t.service.start('전화번호 찾아줘');
    await t.waitForEnd();
    expect(result).toEqual({ ok: true, runId: 'run-1' });
    expect(toEventKeyList(t.eventList)).toEqual([
      'status:running',
      'step:1:running',
      'step:1:ok',
      'step:2:running',
      'step:2:ok',
      'done',
      'status:done',
    ]);
  });

  it('step 요약과 done 요약을 main 이 만든다', async () => {
    const t = setup({ scenario });
    await t.service.start('전화번호 찾아줘');
    await t.waitForEnd();
    const summaryList = t.eventList.flatMap((e) =>
      e.type === 'step' && e.step.status === 'ok' ? [e.step.summary] : [],
    );
    expect(summaryList).toEqual(['페이지 읽기', '‘두 번째 페이지’ 클릭']);
    expect(t.eventList).toContainEqual({ type: 'done', runId: 'run-1', summary: '전화번호는 02-123-4567 입니다' });
    expect(t.driver.click).toHaveBeenCalledWith({ ref: 'e2' });
  });

  it('run 과 step 을 store 에 기록한다', async () => {
    const t = setup({ scenario });
    await t.service.start('전화번호 찾아줘');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')).toMatchObject({
      task: '전화번호 찾아줘',
      status: 'done',
      summary: '전화번호는 02-123-4567 입니다',
    });
    expect(t.store.getRun('run-1')?.endedAt).toEqual(expect.any(String));
    expect(t.store.listSteps('run-1')).toMatchObject([
      { n: 1, tool: 'snapshot', status: 'ok', resultText: SNAPSHOT_TEXT },
      { n: 2, tool: 'click', status: 'ok', inputJson: '{"ref":"e2"}', resultText: '클릭함' },
    ]);
  });

  it('모델 요청에 계약 파라미터를 담고 금지 파라미터는 보내지 않는다', async () => {
    const t = setup({ scenario });
    await t.service.start('전화번호 찾아줘');
    await t.waitForEnd();
    const body = t.requestList[0] ?? {};
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64000,
      stream: true,
      output_config: { effort: 'high' },
      fallbacks: 'default',
      context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] },
      system: [{ type: 'text', cache_control: { type: 'ephemeral' } }],
    });
    expect(body).not.toHaveProperty('thinking');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('thread');
    const firstMessage = (body.messages as { content: string }[])[0]?.content;
    expect(firstMessage).toBe(
      '오늘: 2026-11-05 (목)\n현재 탭: https://shop.example.com/ — 가게\n\n할 일: 전화번호 찾아줘',
    );
  });
});

describe('AgentService — 가드 정지 ②', () => {
  const scenario = {
    turns: [
      toolTurn('snapshot'),
      {
        content: [
          { type: 'tool_use', name: 'click', input: { ref: '$ref(button:예약 확정)' } },
          { type: 'tool_use', name: 'snapshot', input: {} },
        ],
      },
      textTurn('이 요청은 오면 안 된다'),
    ],
  } satisfies TFakeScenario;

  it('“예약 확정” 클릭이면 click 을 부르지 않고 stopped_before_confirm 으로 끝낸다', async () => {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await t.waitForEnd();
    expect(t.driver.click).not.toHaveBeenCalled();
    expect(toEventKeyList(t.eventList)).toEqual([
      'status:running',
      'step:1:running',
      'step:1:ok',
      'step:2:running',
      'step:2:blocked',
      'guard_stopped',
      'status:stopped_before_confirm',
    ]);
  });

  it('guard_stopped 의 display 는 실제 요소 텍스트다', async () => {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await t.waitForEnd();
    expect(t.eventList).toContainEqual({
      type: 'guard_stopped',
      runId: 'run-1',
      reason: expect.any(String),
      display: { action: '클릭', target: '예약 확정' },
    });
    expect(t.store.getRun('run-1')).toMatchObject({ status: 'stopped_before_confirm', reason: '클릭: 예약 확정' });
  });

  it('같은 턴의 두 번째 tool_use 도 실행하지 않고 이후 모델 요청도 없다', async () => {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await t.waitForEnd();
    expect(t.driver.snapshot).toHaveBeenCalledTimes(1);
    expect(t.requestList).toHaveLength(2);
  });

  it('종료 이벤트·종료 status 는 각 1회이고 failed 는 없다', async () => {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await t.waitForEnd();
    const keyList = toEventKeyList(t.eventList);
    expect(keyList.filter((k) => TERMINAL_TYPE_LIST.includes(k))).toEqual(['guard_stopped']);
    expect(keyList.filter((k) => k.startsWith('status:') && k !== 'status:running')).toHaveLength(1);
    expect(keyList).not.toContain('failed');
  });
});

describe('AgentService — 비밀 입력 차단 ③', () => {
  const scenario = {
    turns: [
      toolTurn('snapshot'),
      toolTurn('type_text', { ref: '$ref(textbox:비밀번호)', text: 'hunter2' }),
      textTurn('비밀번호는 직접 입력해 주세요'),
    ],
  };

  it('password 칸이면 typeText 를 부르지 않고 step 을 blocked 로 끝낸다', async () => {
    const t = setup({ scenario });
    await t.service.start('로그인해줘');
    await t.waitForEnd();
    expect(t.driver.typeText).not.toHaveBeenCalled();
    expect(toEventKeyList(t.eventList)).toContain('step:2:blocked');
  });

  it('모델에 is_error tool_result 로 차단 이유를 전달하고 run 은 done 까지 간다', async () => {
    const t = setup({ scenario });
    await t.service.start('로그인해줘');
    await t.waitForEnd();
    expect(getLastToolResultList(t.requestList)).toMatchObject([
      { type: 'tool_result', is_error: true, content: expect.stringContaining(GUARD_MESSAGE.secretField) },
    ]);
    expect(t.store.getRun('run-1')?.status).toBe('done');
  });
});

describe('AgentService — 중지 ④', () => {
  const scenario = { turns: [toolTurn('wait_for', { ms: 3000 }), toolTurn('snapshot'), textTurn('끝')] };

  async function runAndStop() {
    const driver = createFakeDriver();
    const deferred = createDeferred<TActionResult>();
    driver.waitFor.mockReturnValueOnce(deferred.promise);
    const t = setup({ scenario, driver });
    await t.service.start('기다려');
    await vi.waitFor(() => expect(driver.waitFor).toHaveBeenCalled());
    const isStopped = t.service.stop('run-1');
    deferred.resolve({ ok: true, text: '기다림' });
    await t.waitForEnd();
    return { ...t, isStopped };
  }

  it('도구 실행 중 stop() 이면 다음 도구를 실행하지 않고 stopped 로 끝낸다', async () => {
    const t = await runAndStop();
    expect(t.isStopped).toBe(true);
    expect(t.driver.snapshot).not.toHaveBeenCalled();
    expect(t.store.getRun('run-1')?.status).toBe('stopped');
  });

  it('stop 뒤에는 모델 요청이 없다', async () => {
    const t = await runAndStop();
    expect(t.requestList).toHaveLength(1);
  });

  it('stopped 와 status(stopped) 는 각 1회이고 failed 는 없다', async () => {
    const t = await runAndStop();
    const keyList = toEventKeyList(t.eventList);
    expect(keyList.filter((k) => k === 'stopped')).toHaveLength(1);
    expect(keyList.filter((k) => k === 'status:stopped')).toHaveLength(1);
    expect(keyList).not.toContain('failed');
    expect(keyList.slice(-2)).toEqual(['stopped', 'status:stopped']);
  });

  it('없는 runId 나 끝난 run 의 stop 은 false 다', async () => {
    const t = setup({ scenario: { turns: [textTurn('끝')] } });
    expect(t.service.stop('run-x')).toBe(false);
    await t.service.start('끝내');
    await t.waitForEnd();
    expect(t.service.stop('run-1')).toBe(false);
  });
});

describe('AgentService — 시작 실패·BUSY ⑤', () => {
  it('실행 중에 start 하면 BUSY 다', async () => {
    const driver = createFakeDriver();
    const deferred = createDeferred<TActionResult>();
    driver.waitFor.mockReturnValueOnce(deferred.promise);
    const t = setup({ scenario: { turns: [toolTurn('wait_for', { ms: 3000 })] }, driver });
    await t.service.start('첫 번째');
    await vi.waitFor(() => expect(driver.waitFor).toHaveBeenCalled());
    expect(await t.service.start('두 번째')).toEqual({ ok: false, code: 'BUSY', message: AGENT_MESSAGE.busy });
    deferred.resolve({ ok: true, text: '기다림' });
    await t.waitForEnd();
  });

  it('createDriver 가 pending 인 동안 두 번째 start 는 BUSY 이고 run 은 1개만 생긴다', async () => {
    const driver = createFakeDriver();
    const deferred = createDeferred<IBrowserDriver>();
    const t = setup({ scenario: { turns: [textTurn('끝')] }, driver, deps: { createDriver: () => deferred.promise } });
    const first = t.service.start('첫 번째');
    expect(await t.service.start('두 번째')).toMatchObject({ ok: false, code: 'BUSY' });
    deferred.resolve(driver);
    expect(await first).toEqual({ ok: true, runId: 'run-1' });
    await t.waitForEnd();
    expect(t.callList.filter((call) => (call as unknown[])[0] === 'createRun')).toHaveLength(1);
  });

  it('끝난 뒤에는 다시 start 할 수 있다', async () => {
    const t = setup({ scenario: { turns: [textTurn('끝'), textTurn('또 끝')] } });
    await t.service.start('첫 번째');
    await t.waitForEnd();
    await vi.waitFor(async () => expect(await t.service.start('두 번째')).toMatchObject({ ok: true }));
  });
});

describe('AgentService — 시작 실패 ⑤-1', () => {
  it('createModelClient 가 MissingApiKeyError 면 FR-8 문장의 AGENT_ERROR 이고 run 을 만들지 않는다', async () => {
    const t = setup({
      deps: {
        createModelClient: () => {
          throw new MissingApiKeyError();
        },
      },
    });
    expect(await t.service.start('할 일')).toEqual({
      ok: false,
      code: 'AGENT_ERROR',
      message: AGENT_MESSAGE.missingApiKey,
    });
    expect(t.callList).toEqual([]);
    expect(t.eventList).toEqual([]);
  });

  it('createDriver 가 reject 하면 “브라우저 제어 연결에 실패했습니다” 이고 run 을 만들지 않는다', async () => {
    const t = setup({ deps: { createDriver: () => Promise.reject(new Error('ECONNREFUSED')) } });
    expect(await t.service.start('할 일')).toEqual({
      ok: false,
      code: 'AGENT_ERROR',
      message: AGENT_MESSAGE.driverFailed,
    });
    expect(t.callList).toEqual([]);
  });

  it('시작 실패 뒤에는 다시 start 할 수 있다', async () => {
    const createDriver = vi.fn<() => Promise<IBrowserDriver>>().mockRejectedValueOnce(new Error('x'));
    const t = setup({ scenario: { turns: [textTurn('끝')] }, deps: { createDriver } });
    createDriver.mockResolvedValueOnce(t.driver);
    await t.service.start('첫 번째');
    expect(await t.service.start('두 번째')).toMatchObject({ ok: true });
    await t.waitForEnd();
  });
});

describe('AgentService — stop_reason ⑥⑦', () => {
  it('refusal 이면 분류를 담아 failed 로 끝낸다', async () => {
    const t = setup({ scenario: { turns: [{ content: [{ type: 'text', text: '거절' }], stop_reason: 'refusal' }] } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.eventList).toContainEqual({
      type: 'failed',
      runId: 'run-1',
      reason: expect.stringContaining('general_harms'),
    });
    expect(t.store.getRun('run-1')?.status).toBe('failed');
  });

  it('max_tokens 면 그 턴의 도구를 실행하지 않고 failed 로 끝낸다', async () => {
    const t = setup({
      scenario: {
        turns: [{ content: [{ type: 'tool_use', name: 'snapshot', input: {} }], stop_reason: 'max_tokens' }],
      },
    });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.driver.snapshot).not.toHaveBeenCalled();
    expect(t.eventList).toContainEqual({
      type: 'failed',
      runId: 'run-1',
      reason: expect.stringContaining('max_tokens'),
    });
  });
});

describe('AgentService — 호출 상한 ⑧', () => {
  it('도구 호출이 61회째가 되면 실행하지 않고 한도 이유로 failed 로 끝낸다', async () => {
    const t = setup({ scenario: { turns: Array.from({ length: 70 }, () => toolTurn('snapshot')) } });
    await t.service.start('계속 읽어');
    await t.waitForEnd();
    expect(t.driver.snapshot).toHaveBeenCalledTimes(60);
    expect(t.eventList).toContainEqual({ type: 'failed', runId: 'run-1', reason: '도구 호출 한도(60회)를 넘었습니다' });
    expect(t.requestList).toHaveLength(61);
  });
});

describe('AgentService — 도구 실패 ⑨', () => {
  it('driver.click 이 ok:false 면 step 은 error 이고 run 은 계속된다', async () => {
    const driver = createFakeDriver();
    driver.click.mockResolvedValueOnce({ ok: false, reason: 'ref e2 를 찾을 수 없습니다. snapshot 을 다시 찍어라' });
    const t = setup({
      driver,
      scenario: { turns: [toolTurn('click', { ref: 'e2' }), textTurn('다시 해 볼게요')] },
    });
    await t.service.start('클릭');
    await t.waitForEnd();
    expect(toEventKeyList(t.eventList)).toContain('step:1:error');
    expect(getLastToolResultList(t.requestList)).toMatchObject([
      { is_error: true, content: expect.stringContaining('ref e2') },
    ]);
    expect(t.store.getRun('run-1')?.status).toBe('done');
  });

  it('driver 가 throw 해도 step 은 error 이고 run 은 계속된다', async () => {
    const driver = createFakeDriver();
    driver.scroll.mockRejectedValueOnce(new Error('boom'));
    const t = setup({ driver, scenario: { turns: [toolTurn('scroll', { direction: 'down' }), textTurn('끝')] } });
    await t.service.start('스크롤');
    await t.waitForEnd();
    expect(toEventKeyList(t.eventList)).toContain('step:1:error');
    expect(t.store.getRun('run-1')?.status).toBe('done');
  });
});

describe('AgentService — 기록 ⑩', () => {
  it('type_text 의 input_json 에 입력값을 남기지 않는다', async () => {
    const t = setup({
      scenario: { turns: [toolTurn('type_text', { ref: 'e5', text: '강남역 맛집-비밀값' }), textTurn('끝')] },
    });
    await t.service.start('검색');
    await t.waitForEnd();
    expect(t.driver.typeText).toHaveBeenCalledWith({ ref: 'e5', text: '강남역 맛집-비밀값' });
    expect(t.store.listSteps('run-1')[0]?.inputJson).toBe('{"ref":"e5","text":"[입력값 생략]"}');
    expect(JSON.stringify(t.callList)).not.toContain('강남역 맛집-비밀값');
  });
});

describe('AgentService — 키 보호 ⑪ (SR-6)', () => {
  const API_KEY = 'sk-test-key';

  /** 키를 단 SDK 클라이언트 — fetch 는 가짜 */
  function createKeyedClient(fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
    return () => new Anthropic({ apiKey: API_KEY, fetch, maxRetries: 0 });
  }

  it('성공 run 의 이벤트·store·log 어디에도 키가 없다', async () => {
    const fake = createFakeFetch({ turns: [toolTurn('snapshot'), textTurn('끝')] });
    const t = setup({ deps: { createModelClient: createKeyedClient(fake.fetch) } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')?.status).toBe('done');
    expect(JSON.stringify([t.eventList, t.callList, t.log.error.mock.calls])).not.toContain(API_KEY);
  });

  it('인증 실패 run 의 이벤트·store·log 어디에도 키가 없다', async () => {
    const unauthorized = async () =>
      Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        { status: 401 },
      );
    const t = setup({ deps: { createModelClient: createKeyedClient(unauthorized) } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.eventList).toContainEqual({ type: 'failed', runId: 'run-1', reason: expect.stringContaining('API 키') });
    expect(JSON.stringify([t.eventList, t.callList, t.log.error.mock.calls])).not.toContain(API_KEY);
  });

  it('예외로 끝난 run 은 failed 로 기록하고 log 에도 키가 없다', async () => {
    const driver = createFakeDriver();
    driver.getPageInfo.mockRejectedValueOnce(new Error(`page closed ${'x'}`));
    const fake = createFakeFetch({ turns: [] });
    const t = setup({ driver, deps: { createModelClient: createKeyedClient(fake.fetch) } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')).toMatchObject({ status: 'failed', reason: AGENT_MESSAGE.unexpected });
    expect(t.log.error).toHaveBeenCalled();
    expect(JSON.stringify([t.eventList, t.callList, t.log.error.mock.calls])).not.toContain(API_KEY);
  });
});
