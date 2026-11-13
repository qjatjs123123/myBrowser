import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import type { IRunStore, TRunRecord, TStepRecord, TStepUpsert } from '@shared/agent/run';
import type { TFakeScenario, TFakeTurn } from '@shared/agent/fakeScenario';
import { AgentEventSchema, type TAgentEvent } from '@shared/ipc/agent';
import type { TSkill } from '@shared/ipc/skills';
import type { IBrowserDriver, IGuardTarget, TActionResult } from '@shared/tools';

import { createFakeFetch, type TFakeRequestBody } from '../fake/fakeFetch';
import { GUARD_MESSAGE } from '../guard';
import { DEFAULT_MODEL_REQUEST } from '../loop';
import { MissingApiKeyError, MissingCredentialError } from '../modelClient';
import { DEV_MODEL_REQUEST, type IModelProfile } from '../profiles';
import { AGENT_MESSAGE, createAgentService, type IAgentServiceDeps } from '../service';
import { DENIED_RESULT, USER_DONE_RESULT } from '../tools';

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
const TERMINAL_TYPE_LIST = ['done', 'failed', 'stopped'];

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
    takeScreenshot: vi.fn(async () => ({ ok: true as const, pngBase64: '', width: 1280, height: 800 })),
    clickAt: vi.fn(() => ok('완료')),
    typeRaw: vi.fn(() => ok('완료')),
    pressRaw: vi.fn(() => ok('완료')),
    scrollAt: vi.fn(() => ok('완료')),
    moveTo: vi.fn(() => ok('완료')),
    resolvePointTarget: vi.fn(async () => null),
    isInViewport: vi.fn(async () => true),
    showOverlay: vi.fn(async () => undefined),
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
  /** 기본 fake 프로필(가짜 fetch 클라이언트) 위에 덮어쓴다 */
  profile?: Partial<IModelProfile>;
  driver?: ReturnType<typeof createFakeDriver>;
}

function setup({ scenario = { turns: [] }, deps = {}, profile = {}, driver = createFakeDriver() }: ISetupOptions = {}) {
  const fake = createFakeFetch(scenario);
  const { store, callList } = createMemoryStore();
  const eventList: TAgentEvent[] = [];
  const log = { error: vi.fn() };
  let idCount = 0;
  const service = createAgentService({
    profile: {
      kind: 'fake',
      model: 'claude-opus-5-5',
      createClient: () => new Anthropic({ apiKey: 'fake', fetch: fake.fetch, maxRetries: 0 }),
      request: DEFAULT_MODEL_REQUEST,
      hasComputerToolset: true,
      ...profile,
    },
    createDriver: async () => driver,
    runStore: store,
    emit: (event) => eventList.push(AgentEventSchema.parse(event)),
    now: () => new Date(2026, 10, 5, 9, 0),
    createId: () => `run-${++idCount}`,
    guardOptions: { allowedHostList: [] },
    maxToolCalls: 60,
    log,
    skills: { listEnabled: () => [] },
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

  it('fake 프로필 요청 tools 끝에 computer toolset 이 있다', async () => {
    const t = setup({ scenario });
    await t.service.start('전화번호 찾아줘');
    await t.waitForEnd();
    const toolTypeList = ((t.requestList[0]?.tools ?? []) as { type?: string }[]).map((tool) => tool.type);
    expect(toolTypeList).toContain('computer_toolset_20260801');
  });

  it('dev 프로필이면 요청 tools 에 computer toolset 이 없고 fallbacks·모델은 프로필 값이다 (spec 007 FR-4·FR-5)', async () => {
    const t = setup({
      scenario,
      profile: {
        kind: 'dev',
        model: 'bedrock.anthropic.claude-opus-5-5',
        request: DEV_MODEL_REQUEST,
        hasComputerToolset: false,
      },
    });
    await t.service.start('전화번호 찾아줘');
    await t.waitForEnd();
    const body = t.requestList[0] ?? {};
    const toolTypeList = ((body.tools ?? []) as { type?: string }[]).map((tool) => tool.type);
    expect(toolTypeList).not.toContain('computer_toolset_20260801');
    expect(body).not.toHaveProperty('fallbacks');
    expect(body).toMatchObject({ model: 'bedrock.anthropic.claude-opus-5-5' });
  });
});

/** 이벤트 type 이 count 번 나올 때까지 기다린다 */
async function waitForEventCount(eventList: TAgentEvent[], type: TAgentEvent['type'], count = 1) {
  await vi.waitFor(() => expect(eventList.filter((e) => e.type === type).length).toBeGreaterThanOrEqual(count));
}

/** 승인 창 요청 목록 */
function getApprovalRequestList(eventList: TAgentEvent[]) {
  return eventList.flatMap((e) => (e.type === 'approval_required' ? [e.request] : []));
}

/** 마지막 요청의 tool_result 중 n 번째(0부터) content 문자열 */
function getToolResultContent(requestList: TFakeRequestBody[], index = 0): unknown {
  return getLastToolResultList(requestList)[index]?.content;
}

/** “예약 확정” 클릭 + 같은 턴의 snapshot — spec 003 ② 의 픽스처를 승인 대기로 (spec 004) */
const CONFIRM_SCENARIO = {
  turns: [
    toolTurn('snapshot'),
    {
      content: [
        {
          type: 'tool_use',
          name: 'click',
          input: { ref: '$ref(button:예약 확정)' },
        },
        { type: 'tool_use', name: 'snapshot', input: {} },
      ],
    },
    textTurn('끝났습니다'),
  ],
} satisfies TFakeScenario;

async function startConfirm(driver = createFakeDriver()) {
  const t = setup({ scenario: CONFIRM_SCENARIO, driver });
  await t.service.start('예약해줘');
  await waitForEventCount(t.eventList, 'approval_required');
  return t;
}

describe('AgentService — 승인 대기 ① (가드 정지 ② 대체)', () => {
  it('“예약 확정” 클릭이면 click 을 부르지 않고 계약 순서대로 대기 이벤트를 보낸다', async () => {
    const t = await startConfirm();
    expect(t.driver.click).not.toHaveBeenCalled();
    expect(toEventKeyList(t.eventList)).toEqual([
      'status:running',
      'step:1:running',
      'step:1:ok',
      'step:2:running',
      'step:2:waiting',
      'status:waiting_user',
      'approval_required',
    ]);
    t.service.stop('run-1');
    await t.waitForEnd();
  });

  it('승인 창의 display 는 실제 요소 텍스트이고 kind=guard·source=structure 다', async () => {
    const t = await startConfirm();
    expect(getApprovalRequestList(t.eventList)).toEqual([
      {
        requestId: 'req-1',
        stepN: 2,
        kind: 'guard',
        source: 'structure',
        reason: expect.stringContaining('예약 확정'),
        display: { action: '클릭', target: '예약 확정' },
        modelNote: null,
      },
    ]);
    expect(t.store.getRun('run-1')?.status).toBe('waiting_user');
    t.service.stop('run-1');
    await t.waitForEnd();
  });

  it('대기 중에는 같은 턴의 두 번째 tool_use 도 시작하지 않고 모델 요청도 더 없다 ⑬', async () => {
    const t = await startConfirm();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(t.driver.snapshot).toHaveBeenCalledTimes(1);
    expect(t.requestList).toHaveLength(2);
    t.service.stop('run-1');
    await t.waitForEnd();
  });

  it('대기 중 대상 ref 를 강조하고 결정 뒤 지운다', async () => {
    const t = await startConfirm();
    expect(t.driver.showOverlay).toHaveBeenCalledWith({
      kind: 'highlight',
      ref: 'e3',
    });
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
    expect(t.driver.showOverlay).toHaveBeenLastCalledWith({ kind: 'clear' });
  });
});

describe('AgentService — [에이전트가 누르기] ②③⑪', () => {
  it('agent 결정이면 재확인 후 click 을 1회 실행하고 step 은 ok 다', async () => {
    const t = await startConfirm();
    expect(t.service.approve('run-1', 'req-1', 'agent')).toEqual({ ok: true });
    await t.waitForEnd();
    expect(t.driver.click).toHaveBeenCalledTimes(1);
    expect(t.driver.click).toHaveBeenCalledWith({ ref: 'e3' });
    expect(toEventKeyList(t.eventList).slice(6, 10)).toEqual([
      'approval_required',
      'approval_resolved',
      'status:running',
      'step:2:ok',
    ]);
    expect(t.store.getRun('run-1')?.status).toBe('done');
  });

  it('agent 결정이면 대상을 다시 해석한다 (최초 1회 + 재확인 1회)', async () => {
    const t = await startConfirm();
    t.service.approve('run-1', 'req-1', 'agent');
    await t.waitForEnd();
    const e3CallList = t.driver.resolveTarget.mock.calls.filter(([req]) => req.ref === 'e3');
    expect(e3CallList).toHaveLength(2);
  });

  it('재확인 display 가 바뀌면 실행 없이 같은 step 에 새 승인 창을 띄운다', async () => {
    const driver = createFakeDriver();
    let e3Count = 0;
    driver.resolveTarget.mockImplementation(async ({ ref }: { ref?: string }) => {
      if (ref !== 'e3') return ref && TARGET_MAP[ref] ? toTarget(TARGET_MAP[ref]) : null;
      e3Count += 1;
      return toTarget({
        role: 'button',
        name: e3Count === 1 ? '예약 확정' : '결제하기',
      });
    });
    const t = await startConfirm(driver);
    t.service.approve('run-1', 'req-1', 'agent');
    await waitForEventCount(t.eventList, 'approval_required', 2);
    expect(driver.click).not.toHaveBeenCalled();
    expect(getApprovalRequestList(t.eventList)[1]).toMatchObject({
      requestId: 'req-2',
      stepN: 2,
      display: { action: '클릭', target: '결제하기' },
    });
    t.service.approve('run-1', 'req-2', 'denied');
    await t.waitForEnd();
    expect(driver.click).not.toHaveBeenCalled();
  });

  it('agent 결정 후 재판정이 block 이면 실행 없이 step blocked + is_error 다', async () => {
    const driver = createFakeDriver();
    let e3Count = 0;
    driver.resolveTarget.mockImplementation(async ({ ref }: { ref?: string }) => {
      if (ref !== 'e3') return ref && TARGET_MAP[ref] ? toTarget(TARGET_MAP[ref]) : null;
      e3Count += 1;
      return e3Count === 1 ? toTarget(TARGET_MAP.e3 ?? {}) : null;
    });
    const t = await startConfirm(driver);
    t.service.approve('run-1', 'req-1', 'agent');
    await t.waitForEnd();
    expect(driver.click).not.toHaveBeenCalled();
    expect(toEventKeyList(t.eventList)).toContain('step:2:blocked');
    expect(getLastToolResultList(t.requestList)[0]).toMatchObject({
      is_error: true,
      content: expect.stringContaining(GUARD_MESSAGE.unknownTarget),
    });
  });

  it('승인은 1회용 — 다음 턴의 같은 버튼 클릭도 다시 묻는다 (SR-2)', async () => {
    const scenario = {
      turns: [
        toolTurn('snapshot'),
        toolTurn('click', { ref: '$ref(button:예약 확정)' }),
        toolTurn('click', { ref: '$ref(button:예약 확정)' }),
        textTurn('끝'),
      ],
    };
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await waitForEventCount(t.eventList, 'approval_required');
    t.service.approve('run-1', 'req-1', 'agent');
    await waitForEventCount(t.eventList, 'approval_required', 2);
    expect(t.driver.click).toHaveBeenCalledTimes(1);
    t.service.approve('run-1', 'req-2', 'denied');
    await t.waitForEnd();
    expect(t.driver.click).toHaveBeenCalledTimes(1);
  });
});

describe('AgentService — [직접 누를게요]·[거부] ④⑤', () => {
  it('user_done 이면 click 을 부르지 않고 USER_DONE 결과가 다음 요청에 간다', async () => {
    const t = await startConfirm();
    t.service.approve('run-1', 'req-1', 'user_done');
    await t.waitForEnd();
    expect(t.driver.click).not.toHaveBeenCalled();
    expect(getToolResultContent(t.requestList)).toBe(USER_DONE_RESULT);
    expect(toEventKeyList(t.eventList)).toContain('step:2:ok');
  });

  it('denied 면 click 을 부르지 않고 step denied + is_error 아닌 DENIED 결과다', async () => {
    const t = await startConfirm();
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
    expect(t.driver.click).not.toHaveBeenCalled();
    expect(toEventKeyList(t.eventList)).toContain('step:2:denied');
    expect(getLastToolResultList(t.requestList)[0]).toMatchObject({
      content: DENIED_RESULT,
    });
    expect(getLastToolResultList(t.requestList)[0]?.is_error).not.toBe(true);
  });

  it('거부 뒤에는 같은 턴의 남은 도구가 실행되고 run 은 done 까지 간다', async () => {
    const t = await startConfirm();
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
    expect(t.driver.snapshot).toHaveBeenCalledTimes(2);
    expect(t.store.getRun('run-1')?.status).toBe('done');
  });

  it('거부 이벤트 순서는 approval_resolved → status(running) → step(denied) 이다', async () => {
    const t = await startConfirm();
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
    expect(toEventKeyList(t.eventList).slice(6, 10)).toEqual([
      'approval_required',
      'approval_resolved',
      'status:running',
      'step:2:denied',
    ]);
    expect(t.eventList).toContainEqual({
      type: 'approval_resolved',
      runId: 'run-1',
      requestId: 'req-1',
      decision: 'denied',
    });
  });
});

describe('AgentService — 대기 중 중지·종료 ⑥⑫', () => {
  it('대기 중 stop 이면 click 을 부르지 않고 approval_resolved(cancelled) 후 stopped 로 끝난다', async () => {
    const t = await startConfirm();
    expect(t.service.stop('run-1')).toBe(true);
    await t.waitForEnd();
    expect(t.driver.click).not.toHaveBeenCalled();
    expect(t.eventList).toContainEqual({
      type: 'approval_resolved',
      runId: 'run-1',
      requestId: 'req-1',
      decision: 'cancelled',
    });
    expect(t.store.getRun('run-1')?.status).toBe('stopped');
  });

  it('대기 중 stop 이면 종료 이벤트·종료 status 가 정확히 1회이고 failed 는 없다 (Task 6 회귀)', async () => {
    const t = await startConfirm();
    t.service.stop('run-1');
    await t.waitForEnd();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const keyList = toEventKeyList(t.eventList);
    expect(keyList.filter((k) => TERMINAL_TYPE_LIST.includes(k))).toEqual(['stopped']);
    expect(keyList.filter((k) => k === 'status:stopped')).toHaveLength(1);
    expect(keyList).not.toContain('failed');
    expect(keyList.slice(-2)).toEqual(['stopped', 'status:stopped']);
    expect(t.driver.click).not.toHaveBeenCalled();
  });

  it('대기 중 stop 하면 status 는 waiting_user 에서 바로 stopped 가 되고 running 으로 돌아가지 않는다', async () => {
    const t = await startConfirm();
    t.service.stop('run-1');
    await t.waitForEnd();
    const statusList = toEventKeyList(t.eventList).filter((k) => k.startsWith('status:'));
    expect(statusList.slice(-2)).toEqual(['status:waiting_user', 'status:stopped']);
  });

  it('대기 중 shutdown 이면 click 을 부르지 않고 failed(앱 종료) 1회로 끝난다', async () => {
    const t = await startConfirm();
    t.service.shutdown();
    await t.waitForEnd();
    expect(t.driver.click).not.toHaveBeenCalled();
    const keyList = toEventKeyList(t.eventList);
    expect(keyList.filter((k) => TERMINAL_TYPE_LIST.includes(k))).toEqual(['failed']);
    expect(t.eventList).toContainEqual({
      type: 'failed',
      runId: 'run-1',
      reason: AGENT_MESSAGE.appQuit,
    });
    expect(t.store.getRun('run-1')).toMatchObject({
      status: 'failed',
      reason: AGENT_MESSAGE.appQuit,
    });
  });

  it('shutdown 뒤에는 모델 요청이 더 없다', async () => {
    const t = await startConfirm();
    t.service.shutdown();
    await t.waitForEnd();
    expect(t.requestList).toHaveLength(2);
  });

  it('활성 run 이 없으면 shutdown 은 아무것도 하지 않는다', () => {
    const t = setup();
    t.service.shutdown();
    expect(t.eventList).toEqual([]);
  });

  it('취소된 요청에는 approve 가 NOT_FOUND 다', async () => {
    const t = await startConfirm();
    t.service.stop('run-1');
    expect(t.service.approve('run-1', 'req-1', 'agent')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    await t.waitForEnd();
    expect(t.driver.click).not.toHaveBeenCalled();
  });
});

describe('AgentService — 승인 상한 ⑦', () => {
  it('승인 6번째 요청은 대기 없이 blocked 이고 click 은 한 번도 실행되지 않는다', async () => {
    const turnList = Array.from({ length: 6 }, () => toolTurn('click', { ref: 'e3' }));
    const t = setup({ scenario: { turns: [...turnList, textTurn('끝')] } });
    await t.service.start('예약해줘');
    for (let i = 1; i <= 5; i += 1) {
      await waitForEventCount(t.eventList, 'approval_required', i);
      t.service.approve('run-1', `req-${i}`, 'denied');
    }
    await t.waitForEnd();
    expect(getApprovalRequestList(t.eventList)).toHaveLength(5);
    expect(toEventKeyList(t.eventList)).toContain('step:6:blocked');
    expect(getToolResultContent(t.requestList)).toEqual(expect.stringContaining('too_many_approvals'));
    expect(t.driver.click).not.toHaveBeenCalled();
  });
});

describe('AgentService — ask_user ⑧', () => {
  const ANSWER = '세 명이요-원문답변';
  const scenario = {
    turns: [
      toolTurn('ask_user', {
        question: '몇 명으로 예약할까요?',
        optionList: ['2명', '4명'],
      }),
      textTurn('끝'),
    ],
  };

  async function askAndAnswer() {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await waitForEventCount(t.eventList, 'question');
    const result = t.service.answer('run-1', 'req-1', ANSWER);
    await t.waitForEnd();
    return { ...t, result };
  }

  it('question 이벤트를 보내고 answer 뒤 “사용자 답: …” 이 다음 요청에 간다', async () => {
    const t = await askAndAnswer();
    expect(t.result).toEqual({ ok: true });
    expect(t.eventList).toContainEqual({
      type: 'question',
      runId: 'run-1',
      question: {
        requestId: 'req-1',
        stepN: 1,
        text: '몇 명으로 예약할까요?',
        optionList: ['2명', '4명'],
      },
    });
    expect(getToolResultContent(t.requestList)).toBe(`사용자 답: ${ANSWER}`);
  });

  it('질문 이벤트 순서는 step(waiting) → status(waiting_user) → question → question_answered → status(running) → step(ok) 이다', async () => {
    const t = await askAndAnswer();
    expect(toEventKeyList(t.eventList).slice(0, 8)).toEqual([
      'status:running',
      'step:1:running',
      'step:1:waiting',
      'status:waiting_user',
      'question',
      'question_answered',
      'status:running',
      'step:1:ok',
    ]);
  });

  it('store·이벤트 어디에도 답 원문이 없고 step 결과는 “[답변 생략]” 이다', async () => {
    const t = await askAndAnswer();
    expect(JSON.stringify([t.callList, t.eventList])).not.toContain(ANSWER);
    expect(t.store.listSteps('run-1')[0]).toMatchObject({
      tool: 'ask_user',
      resultText: '[답변 생략]',
    });
  });

  it('질문 요청에 approve 하면 INVALID_INPUT 이고 대기는 그대로다', async () => {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await waitForEventCount(t.eventList, 'question');
    expect(t.service.approve('run-1', 'req-1', 'agent')).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(t.service.answer('run-1', 'req-1', '2명')).toEqual({ ok: true });
    await t.waitForEnd();
  });
});

describe('AgentService — request_approval ⑨⑩', () => {
  const scenario = {
    turns: [
      toolTurn('request_approval', {
        action: '4명으로 변경',
        target: '인원',
        reason: '2명 자리 없음',
      }),
      textTurn('끝'),
    ],
  };

  async function startRequest() {
    const t = setup({ scenario });
    await t.service.start('예약해줘');
    await waitForEventCount(t.eventList, 'approval_required');
    return t;
  }

  it('kind=model 승인 창을 띄우고 모델 문장은 modelNote 로만 싣는다', async () => {
    const t = await startRequest();
    expect(getApprovalRequestList(t.eventList)[0]).toEqual({
      requestId: 'req-1',
      stepN: 1,
      kind: 'model',
      source: 'model',
      reason: expect.any(String),
      display: { action: '확인 요청', target: '' },
      modelNote: '4명으로 변경 — 인원: 2명 자리 없음',
    });
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
  });

  it('approved 면 “approved” 결과다', async () => {
    const t = await startRequest();
    expect(t.service.approve('run-1', 'req-1', 'approved')).toEqual({
      ok: true,
    });
    await t.waitForEnd();
    expect(getToolResultContent(t.requestList)).toBe('approved');
  });

  it('denied 면 DENIED 결과이고 step 은 denied 다', async () => {
    const t = await startRequest();
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
    expect(getToolResultContent(t.requestList)).toBe(DENIED_RESULT);
    expect(toEventKeyList(t.eventList)).toContain('step:1:denied');
  });

  it.each(['agent', 'user_done'] as const)(
    'model 요청에 %s 결정은 INVALID_INPUT 이고 대기는 그대로다',
    async (decision) => {
      const t = await startRequest();
      expect(t.service.approve('run-1', 'req-1', decision)).toEqual({
        ok: false,
        code: 'INVALID_INPUT',
        message: AGENT_MESSAGE.invalidRequest,
      });
      expect(t.service.approve('run-1', 'req-1', 'denied')).toEqual({
        ok: true,
      });
      await t.waitForEnd();
    },
  );

  it('guard 요청에 approved 결정은 INVALID_INPUT 이고 click 은 실행되지 않는다', async () => {
    const t = await startConfirm();
    expect(t.service.approve('run-1', 'req-1', 'approved')).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(t.driver.click).not.toHaveBeenCalled();
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
  });

  it('승인 요청에 answer 하면 INVALID_INPUT 이다', async () => {
    const t = await startRequest();
    expect(t.service.answer('run-1', 'req-1', '네')).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
  });

  it.each([
    ['run-1', 'req-9'],
    ['run-x', 'req-1'],
  ])('없는 요청(%s, %s)이면 NOT_FOUND 다', async (runId, requestId) => {
    const t = await startRequest();
    expect(t.service.approve(runId, requestId, 'approved')).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: AGENT_MESSAGE.requestNotFound,
    });
    expect(t.service.answer(runId, requestId, 'x')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    t.service.approve('run-1', 'req-1', 'denied');
    await t.waitForEnd();
  });

  it('이미 처리한 요청에 다시 approve 하면 NOT_FOUND 다', async () => {
    const t = await startRequest();
    t.service.approve('run-1', 'req-1', 'approved');
    expect(t.service.approve('run-1', 'req-1', 'approved')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    await t.waitForEnd();
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
  it('profile.createClient 가 MissingApiKeyError 면 FR-8 문장의 AGENT_ERROR 이고 run 을 만들지 않는다', async () => {
    const t = setup({
      profile: {
        createClient: () => {
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

describe('AgentService — 입력 토큰 상한 (spec 020 FR-1)', () => {
  const TURN_INPUT_TOKENS = 600;

  /** 가짜 fetch 응답의 입력 토큰(고정 10)을 턴당 600 으로 바꾼다 */
  function createUsageFetch(scenario: TFakeScenario) {
    const fake = createFakeFetch(scenario);
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const text = await (await fake.fetch(input, init)).text();
      const replaced = text.replaceAll('"input_tokens":10', `"input_tokens":${TURN_INPUT_TOKENS}`);
      return new Response(replaced, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    return { fetch, requestList: fake.requestList };
  }

  function setupWithUsage(maxInputTokens?: number) {
    const usageFetch = createUsageFetch({
      turns: [toolTurn('snapshot'), toolTurn('read_text'), toolTurn('snapshot'), textTurn('끝')],
    });
    const t = setup({
      deps: { maxInputTokens },
      profile: { createClient: () => new Anthropic({ apiKey: 'fake', fetch: usageFetch.fetch, maxRetries: 0 }) },
    });
    return { ...t, requestList: usageFetch.requestList };
  }

  it('누적 입력 토큰이 상한 안이면 다음 턴으로 계속한다', async () => {
    const t = setupWithUsage(1000);
    await t.service.start('읽어');
    await t.waitForEnd();
    expect(t.driver.snapshot).toHaveBeenCalledTimes(1);
  });

  it('누적 입력 토큰이 상한을 넘으면 한도 사유로 failed 로 끝낸다', async () => {
    const t = setupWithUsage(1000);
    await t.service.start('읽어');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')).toMatchObject({ status: 'failed', reason: '입력 토큰 한도(1000)를 넘었습니다' });
  });

  it('상한을 넘으면 그 턴의 도구와 다음 모델 호출을 하지 않는다', async () => {
    const t = setupWithUsage(1000);
    await t.service.start('읽어');
    await t.waitForEnd();
    expect([t.requestList.length, t.driver.readText.mock.calls.length]).toEqual([2, 0]);
  });

  it('상한을 넘어 끝난 run 의 usage_json 에 누적 입력 토큰 1200 을 남긴다', async () => {
    const t = setupWithUsage(1000);
    await t.service.start('읽어');
    await t.waitForEnd();
    expect(t.callList).toContainEqual([
      'updateRun',
      'run-1',
      expect.objectContaining({ status: 'failed', usageJson: expect.stringContaining('"inputTokens":1200') }),
    ]);
  });

  it('상한이 없으면 큰 usage 에도 끝까지 계속한다', async () => {
    const t = setupWithUsage();
    await t.service.start('읽어');
    await t.waitForEnd();
    expect([t.store.getRun('run-1')?.status, t.requestList.length]).toEqual(['done', 4]);
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
    const t = setup({ profile: { createClient: createKeyedClient(fake.fetch) } });
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
    const t = setup({ profile: { createClient: createKeyedClient(unauthorized) } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.eventList).toContainEqual({ type: 'failed', runId: 'run-1', reason: expect.stringContaining('API 키') });
    expect(JSON.stringify([t.eventList, t.callList, t.log.error.mock.calls])).not.toContain(API_KEY);
  });

  it('예외로 끝난 run 은 failed 로 기록하고 log 에도 키가 없다', async () => {
    const driver = createFakeDriver();
    driver.getPageInfo.mockRejectedValueOnce(new Error(`page closed ${'x'}`));
    const fake = createFakeFetch({ turns: [] });
    const t = setup({ driver, profile: { createClient: createKeyedClient(fake.fetch) } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')).toMatchObject({ status: 'failed', reason: AGENT_MESSAGE.unexpected });
    expect(t.log.error).toHaveBeenCalled();
    expect(JSON.stringify([t.eventList, t.callList, t.log.error.mock.calls])).not.toContain(API_KEY);
  });
});

describe('AgentService — prod 프로필 오류 문장 (spec 005 FR-6)', () => {
  /** 상태 코드만 돌려주는 가짜 게이트웨이 fetch */
  function createStatusClient(status: number, type: string) {
    const fetch = async () => Response.json({ type: 'error', error: { type, message: 'x' } }, { status });
    return () => new Anthropic({ apiKey: 'device-token', baseURL: 'http://127.0.0.1:1', fetch, maxRetries: 0 });
  }

  it.each([
    [401, 'authentication_error', AGENT_MESSAGE.gatewayUnauthorized],
    [402, 'insufficient_credits', AGENT_MESSAGE.gatewayNoCredits],
    [429, 'rate_limit_error', AGENT_MESSAGE.gatewayRateLimited],
  ])('prod 프로필 %i 이면 구독 문장으로 failed', async (status, type, reason) => {
    const onAuthFailure = vi.fn();
    const t = setup({
      deps: { onAuthFailure },
      profile: { kind: 'prod', createClient: createStatusClient(status, type) },
    });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')).toMatchObject({ status: 'failed', reason });
    expect(onAuthFailure).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
  });

  it('dev 프로필 401 은 기존 API 키 문장 그대로이고 onAuthFailure 를 부르지 않는다', async () => {
    const onAuthFailure = vi.fn();
    const t = setup({
      deps: { onAuthFailure },
      profile: { kind: 'dev', createClient: createStatusClient(401, 'authentication_error') },
    });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.store.getRun('run-1')?.reason).toContain('API 키');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it('MissingCredentialError 면 구독 안내 AGENT_ERROR 이고 run 을 만들지 않는다', async () => {
    const t = setup({
      profile: {
        kind: 'prod',
        createClient: () => {
          throw new MissingCredentialError();
        },
      },
    });
    expect(await t.service.start('할 일')).toEqual({
      ok: false,
      code: 'AGENT_ERROR',
      message: AGENT_MESSAGE.missingCredential,
    });
    expect(t.callList).toEqual([]);
  });

  it('run 이 끝나면 onRunEnd 를 1번 부른다 (done·failed)', async () => {
    const onRunEnd = vi.fn();
    const t = setup({ scenario: { turns: [textTurn('끝')] }, deps: { onRunEnd } });
    await t.service.start('할 일');
    await t.waitForEnd();
    await vi.waitFor(() => expect(onRunEnd).toHaveBeenCalledTimes(1));
  });
});

describe('AgentService — 스킬 (spec 013)', () => {
  const SKILL_BODY = '인원 말이 없으면 2명 — 비밀 지침 본문';
  const SKILL: TSkill = {
    id: '00000000-0000-4000-8000-000000000001',
    name: '기본 인원',
    description: '',
    body: SKILL_BODY,
    isEnabled: true,
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
  };

  it('켜진 스킬이 있으면 요청 system 두 번째 블록에 이름과 내용이 들어간다', async () => {
    const t = setup({ scenario: { turns: [textTurn('끝')] }, deps: { skills: { listEnabled: () => [SKILL] } } });
    await t.service.start('할 일');
    await t.waitForEnd();
    const systemList = t.requestList[0]?.system as { text: string; cache_control?: unknown }[];
    expect(systemList).toHaveLength(2);
    expect(systemList[1]).toEqual({ type: 'text', text: expect.stringContaining(`## 기본 인원\n${SKILL_BODY}`) });
  });

  it('켜진 스킬이 없으면 요청 system 은 고정 블록 1개다', async () => {
    const t = setup({ scenario: { turns: [textTurn('끝')] } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.requestList[0]?.system).toHaveLength(1);
  });

  it('skills 의존이 없으면 스킬 없이 실행한다', async () => {
    const t = setup({ scenario: { turns: [textTurn('끝')] }, deps: { skills: undefined } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.requestList[0]?.system).toHaveLength(1);
  });

  it('listEnabled 가 throw 하면 스킬 없이 끝까지 실행한다', async () => {
    const listEnabled = () => {
      throw new Error('database is locked');
    };
    const t = setup({ scenario: { turns: [textTurn('끝')] }, deps: { skills: { listEnabled } } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.requestList[0]?.system).toHaveLength(1);
    expect(t.eventList.some((event) => event.type === 'done')).toBe(true);
  });

  it('listEnabled 가 throw 하면 오류 이름·메시지만 로그에 남긴다', async () => {
    const listEnabled = () => {
      throw new Error('database is locked');
    };
    const t = setup({ scenario: { turns: [textTurn('끝')] }, deps: { skills: { listEnabled } } });
    await t.service.start('할 일');
    await t.waitForEnd();
    expect(t.log.error).toHaveBeenCalledWith('agent', expect.any(String), {
      name: 'Error',
      message: 'database is locked',
    });
  });

  it('스킬 내용은 로그·실행 기록·이벤트에 남지 않는다 (SR-3)', async () => {
    const t = setup({
      scenario: { turns: [toolTurn('snapshot'), textTurn('끝')] },
      deps: { skills: { listEnabled: () => [SKILL] } },
    });
    await t.service.start('할 일');
    await t.waitForEnd();
    const recorded = JSON.stringify([t.callList, t.eventList, t.log.error.mock.calls]);
    expect(recorded).not.toContain(SKILL_BODY);
  });
});
