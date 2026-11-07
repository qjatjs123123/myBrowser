/**
 * 픽셀 toolset — 실제 SDK toolRunner + 가짜 fetch(시나리오 toolset_name:'computer')로 멤버 호출 → 가드 → 승인 → 드라이버를 확인한다.
 * 실제 API·브라우저는 쓰지 않는다 (드라이버는 vi.fn 가짜). 승인 전 미실행(SR-1)은 대기 시점의 호출 수로 확인한다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import type { TFakeTurn } from '@shared/agent/fakeScenario';
import type { IBrowserDriver, IGuardTarget } from '@shared/tools';

import { createFakeFetch, type TFakeRequestBody } from '../../fake/fakeFetch';
import { GUARD_MESSAGE } from '../../guard';
import { runAgentLoop } from '../../loop';
import { createRepeatTracker } from '../../repeatTracker';
import {
  createExclusiveQueue,
  createToolList,
  DENIED_RESULT,
  type IToolRunContext,
  type TUserRequest,
} from '../../tools';
import { createFakeDriver } from '../../tools/__tests__/fakeDriver';
import type { TWaitAnswer } from '../../waits';
import { BrowserComputerToolset, PIXEL_MESSAGE } from '../toolset';

type TDecision = 'agent' | 'user_done' | 'denied';

function createTarget(patch: Partial<IGuardTarget> = {}): IGuardTarget {
  return {
    role: '',
    name: '',
    text: '',
    value: '',
    href: '',
    formAction: '',
    formSubmitText: '',
    inputType: '',
    autocomplete: '',
    fieldName: '',
    label: '',
    pageUrl: 'https://shop.example.com/',
    ...patch,
  };
}

const CONFIRM_BUTTON = createTarget({ role: 'button', name: '예약 확정' });
const LOOKUP_BUTTON = createTarget({ role: 'button', name: '예약 조회' });
const PAY_BUTTON = createTarget({ role: 'button', name: '결제하기' });
const PASSWORD = createTarget({ role: 'textbox', inputType: 'password', fieldName: 'pw' });
const SEARCH_BOX = createTarget({ role: 'searchbox', name: '검색어', inputType: 'search' });
const PEOPLE_INPUT = createTarget({ role: 'textbox', name: '인원', inputType: 'text', formSubmitText: '예약 확정' });

/** 시나리오의 픽셀 멤버 호출 1턴 */
function pixel(name: string, input: Record<string, unknown>): TFakeTurn {
  return { content: [{ type: 'tool_use', name, input, toolset_name: 'computer' }] };
}

interface IStepLog {
  tool: string;
  storedInput: unknown;
  statusList: string[];
}

interface IHarness {
  driver: IBrowserDriver;
  ctx: IToolRunContext;
  stepList: IStepLog[];
  waitList: TUserRequest[];
  /** 대기를 받은 시점의 드라이버 행동 호출 수 (승인 전 미실행 확인) */
  actCountAtWait: number[];
}

function createHarness(decision: TDecision = 'denied'): IHarness {
  const driver = createFakeDriver();
  const stepList: IStepLog[] = [];
  const waitList: TUserRequest[] = [];
  const actCountAtWait: number[] = [];
  const countActs = () =>
    [driver.clickAt, driver.typeRaw, driver.pressRaw, driver.scrollAt, driver.moveTo].reduce(
      (sum, fn) => sum + vi.mocked(fn).mock.calls.length,
      0,
    );
  const ctx: IToolRunContext = {
    driver,
    allowedHostList: [],
    approvalCount: 0,
    isHalted: () => false,
    countToolCall: () => true,
    beginStep: (step) => stepList.push({ tool: step.tool, storedInput: step.storedInput, statusList: [] }),
    endStep: (n, status) => stepList[n - 1]?.statusList.push(status),
    waitForUser: vi.fn(async (request: TUserRequest): Promise<TWaitAnswer> => {
      waitList.push(request);
      actCountAtWait.push(countActs());
      return { type: 'decision', decision };
    }),
    overlay: vi.fn(async () => undefined),
    runExclusive: createExclusiveQueue(),
    repeatTracker: createRepeatTracker(),
  };
  return { driver, ctx, stepList, waitList, actCountAtWait };
}

/** 가짜 fetch 를 단 실제 SDK 로 시나리오를 끝까지 돌린다 */
async function runScenario(harness: IHarness, turnList: TFakeTurn[]) {
  const fake = createFakeFetch({ turns: [...turnList, { content: [{ type: 'text', text: '끝' }] }] });
  const client = new Anthropic({ apiKey: 'fake', fetch: fake.fetch, maxRetries: 0 });
  const outcome = await runAgentLoop({
    client,
    model: 'claude-opus-5-5',
    tools: createToolList(harness.ctx),
    systemPrompt: '시스템',
    firstUserMessage: '할 일',
    signal: new AbortController().signal,
  });
  return { outcome, requestList: fake.requestList };
}

/** n 번째 요청(1부터 — 도구 결과를 싣는 요청)의 tool_result 블록 */
function getToolResult(requestList: TFakeRequestBody[], n: number): Record<string, unknown> {
  const messageList = (requestList[n]?.messages ?? []) as Array<{ role: string; content: unknown }>;
  const content = messageList.at(-1)?.content;
  const block = Array.isArray(content) ? (content[0] as Record<string, unknown>) : undefined;
  if (!block) throw new Error(`요청 ${n} 에 tool_result 가 없다`);
  return block;
}

function getText(block: Record<string, unknown>): string {
  const content = block.content;
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.map((item: { text?: string }) => item.text ?? '').join('\n') : '';
}

describe('BrowserComputerToolset 생성', () => {
  it('④-4 type·key 를 켜도 confirm 을 넘기므로 생성자가 throw 하지 않는다', () => {
    expect(() => new BrowserComputerToolset(createHarness().ctx)).not.toThrow();
  });

  it('⑦ tools 목록에 이름 없는 computer_toolset_20260801 엔트리로 직렬화되고 zoom 은 꺼진다', async () => {
    const { requestList } = await runScenario(createHarness(), []);
    const toolList = (requestList[0]?.tools ?? []) as Array<Record<string, unknown>>;
    const entry = toolList.find((tool) => tool.type === 'computer_toolset_20260801');
    expect(entry).toBeDefined();
    expect(entry).not.toHaveProperty('name');
    expect(entry?.configs).toMatchObject({ zoom: { enabled: false }, cursor_position: { enabled: false } });
  });
});

describe('screenshot', () => {
  it('① 이미지 결과를 toolset_name 과 함께 돌려준다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.takeScreenshot).mockResolvedValue({
      ok: true,
      pngBase64: 'iVBORw0K',
      width: 1280,
      height: 800,
    });
    const { requestList } = await runScenario(harness, [pixel('screenshot', {})]);
    const result = getToolResult(requestList, 1);
    expect(result).toMatchObject({ type: 'tool_result', toolset_name: 'computer' });
    expect(result.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0K' } },
    ]);
    expect(harness.stepList[0]).toMatchObject({ tool: 'computer.screenshot', statusList: ['ok'] });
  });
});

describe('left_click', () => {
  it('② 좌표가 canvas(요소 미상)면 승인을 기다리고, [에이전트가 누르기] 뒤 clickAt 을 1회 부른다', async () => {
    const harness = createHarness('agent');
    await runScenario(harness, [pixel('left_click', { coordinate: [100, 200] })]);
    expect(harness.waitList[0]).toMatchObject({
      kind: 'approval',
      approval: { source: 'pixel', display: { action: '클릭', target: '좌표 (100, 200) — 요소를 확인할 수 없음' } },
    });
    expect(harness.actCountAtWait).toEqual([0]);
    expect(harness.driver.clickAt).toHaveBeenCalledOnce();
    expect(harness.driver.clickAt).toHaveBeenCalledWith({ x: 100, y: 200, count: 1 });
  });

  it('② 요소 미상 좌표에서 [거부] 하면 clickAt 을 부르지 않고 거부 결과를 준다', async () => {
    const harness = createHarness('denied');
    const { requestList } = await runScenario(harness, [pixel('left_click', { coordinate: [100, 200] })]);
    expect(harness.driver.clickAt).not.toHaveBeenCalled();
    expect(getText(getToolResult(requestList, 1))).toContain(DENIED_RESULT);
    expect(harness.stepList[0]?.statusList).toEqual(['waiting', 'denied']);
  });

  it('② 요소 미상 좌표에서 [직접 누를게요] 면 clickAt 을 부르지 않는다', async () => {
    const harness = createHarness('user_done');
    await runScenario(harness, [pixel('left_click', { coordinate: [100, 200] })]);
    expect(harness.driver.clickAt).not.toHaveBeenCalled();
  });

  it('③ 일반 버튼 좌표면 대기 없이 바로 clickAt 을 부른다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.resolvePointTarget).mockResolvedValue(LOOKUP_BUTTON);
    const { requestList } = await runScenario(harness, [pixel('left_click', { coordinate: [50, 60] })]);
    expect(harness.ctx.waitForUser).not.toHaveBeenCalled();
    expect(harness.driver.clickAt).toHaveBeenCalledWith({ x: 50, y: 60, count: 1 });
    expect(getToolResult(requestList, 1).is_error).not.toBe(true);
  });

  it('double_click 이 “예약 확정” 좌표면 대기하고 거부 시 clickAt 을 부르지 않는다', async () => {
    const harness = createHarness('denied');
    vi.mocked(harness.driver.resolvePointTarget).mockResolvedValue(CONFIRM_BUTTON);
    await runScenario(harness, [pixel('double_click', { coordinate: [50, 60] })]);
    expect(harness.waitList).toHaveLength(1);
    expect(harness.driver.clickAt).not.toHaveBeenCalled();
  });

  it('④-3 mouse_move 뒤 coordinate 없는 left_click 은 그 좌표로 판정·실행한다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.resolvePointTarget).mockResolvedValue(LOOKUP_BUTTON);
    await runScenario(harness, [pixel('mouse_move', { coordinate: [300, 400] }), pixel('left_click', {})]);
    expect(harness.driver.moveTo).toHaveBeenCalledWith({ x: 300, y: 400 });
    expect(harness.driver.resolvePointTarget).toHaveBeenCalledWith({ x: 300, y: 400 });
    expect(harness.driver.clickAt).toHaveBeenCalledWith({ x: 300, y: 400, count: 1 });
  });

  it('④-3 커서 위치 없이 coordinate 없는 left_click 은 실행 없이 차단한다', async () => {
    const harness = createHarness();
    const { requestList } = await runScenario(harness, [pixel('left_click', {})]);
    expect(harness.driver.clickAt).not.toHaveBeenCalled();
    expect(harness.driver.resolvePointTarget).not.toHaveBeenCalled();
    expect(getToolResult(requestList, 1)).toMatchObject({ is_error: true });
    expect(getText(getToolResult(requestList, 1))).toContain(PIXEL_MESSAGE.noCursor);
    expect(harness.stepList[0]?.statusList).toEqual(['blocked']);
  });

  it('승인을 거부한 클릭은 커서 위치를 바꾸지 않는다 — 다음 좌표 없는 클릭은 차단된다', async () => {
    const harness = createHarness('denied');
    await runScenario(harness, [pixel('left_click', { coordinate: [100, 200] }), pixel('left_click', {})]);
    expect(harness.driver.clickAt).not.toHaveBeenCalled();
    expect(harness.stepList[1]?.statusList).toEqual(['blocked']);
  });

  it('⑤ 뷰포트 밖 좌표면 판정·대기·실행 없이 차단한다', async () => {
    const harness = createHarness('agent');
    vi.mocked(harness.driver.isInViewport).mockResolvedValue(false);
    const { requestList } = await runScenario(harness, [pixel('left_click', { coordinate: [5000, 5000] })]);
    expect(harness.driver.clickAt).not.toHaveBeenCalled();
    expect(harness.driver.resolvePointTarget).not.toHaveBeenCalled();
    expect(harness.ctx.waitForUser).not.toHaveBeenCalled();
    expect(getText(getToolResult(requestList, 1))).toContain(PIXEL_MESSAGE.outOfViewport);
  });

  it('⑤ 뷰포트 밖 scroll 도 실행 없이 차단한다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.isInViewport).mockResolvedValue(false);
    await runScenario(harness, [
      pixel('scroll', { coordinate: [5000, 10], scroll_direction: 'down', scroll_amount: 3 }),
    ]);
    expect(harness.driver.scrollAt).not.toHaveBeenCalled();
  });
});

describe('type', () => {
  it('④ 포커스가 password 칸이면 차단하고 typeRaw 를 부르지 않는다', async () => {
    const harness = createHarness('agent');
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(PASSWORD);
    const { requestList } = await runScenario(harness, [pixel('type', { text: 'hunter2' })]);
    expect(harness.driver.typeRaw).not.toHaveBeenCalled();
    expect(harness.ctx.waitForUser).not.toHaveBeenCalled();
    expect(getText(getToolResult(requestList, 1))).toContain(GUARD_MESSAGE.secretField);
    expect(harness.stepList[0]?.statusList).toEqual(['blocked']);
  });

  it('type 은 submit 대체 없이 포커스된 요소 그 자체로 대상을 해석한다', async () => {
    const harness = createHarness('agent');
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(PASSWORD);
    await runScenario(harness, [pixel('type', { text: 'hunter2' })]);
    expect(harness.driver.resolveTarget).toHaveBeenCalledWith({ focused: 'element' });
    expect(harness.driver.resolveTarget).not.toHaveBeenCalledWith({ focused: true });
  });

  it('step 에 type 의 글자를 저장하지 않는다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(PASSWORD);
    await runScenario(harness, [pixel('type', { text: 'hunter2' })]);
    expect(harness.stepList[0]).toMatchObject({ tool: 'computer.type', storedInput: { text: '[입력값 생략]' } });
    expect(JSON.stringify(harness.stepList)).not.toContain('hunter2');
  });

  it('④-1 폼 submit 이 “예약 확정”인 칸에 "2명\\n" 이면 submit 판정으로 대기하고 거부 시 typeRaw 를 부르지 않는다', async () => {
    const harness = createHarness('denied');
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(PEOPLE_INPUT);
    await runScenario(harness, [pixel('type', { text: '2명\n' })]);
    expect(harness.waitList[0]).toMatchObject({
      approval: { display: { action: '입력 후 제출', target: '예약 확정' } },
    });
    expect(harness.driver.typeRaw).not.toHaveBeenCalled();
  });

  it('④-1 일반 검색칸에 "강남" 이면 대기 없이 typeRaw 를 부른다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(SEARCH_BOX);
    await runScenario(harness, [pixel('type', { text: '강남' })]);
    expect(harness.ctx.waitForUser).not.toHaveBeenCalled();
    expect(harness.driver.typeRaw).toHaveBeenCalledWith({ text: '강남' });
  });

  it('④-2 포커스가 “예약 확정” 버튼일 때 type " " 은 대기하고 거부 시 typeRaw 를 부르지 않는다', async () => {
    const harness = createHarness('denied');
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(CONFIRM_BUTTON);
    await runScenario(harness, [pixel('type', { text: ' ' })]);
    expect(harness.waitList[0]).toMatchObject({ approval: { display: { action: '클릭', target: '예약 확정' } } });
    expect(harness.driver.typeRaw).not.toHaveBeenCalled();
  });

  it('[에이전트가 누르기] 재확인 때 포커스가 바뀌면(입력칸 → 확정 버튼) 실행 없이 새 승인을 요청한다', async () => {
    const harness = createHarness('agent');
    vi.mocked(harness.driver.resolveTarget)
      .mockResolvedValueOnce(PEOPLE_INPUT)
      .mockResolvedValueOnce(CONFIRM_BUTTON)
      .mockResolvedValue(CONFIRM_BUTTON);
    await runScenario(harness, [pixel('type', { text: '2명\n' })]);
    expect(harness.waitList).toHaveLength(2);
    expect(harness.actCountAtWait).toEqual([0, 0]);
    expect(harness.waitList[1]).toMatchObject({ approval: { display: { action: '클릭', target: '예약 확정' } } });
    expect(harness.driver.typeRaw).toHaveBeenCalledOnce();
  });
});

describe('key', () => {
  it.each(['space', 'KP_Enter'])(
    '④-2 포커스가 “예약 확정” 버튼일 때 key %s 는 대기하고 거부 시 pressRaw 를 부르지 않는다',
    async (text) => {
      const harness = createHarness('denied');
      vi.mocked(harness.driver.resolveTarget).mockResolvedValue(CONFIRM_BUTTON);
      await runScenario(harness, [pixel('key', { text })]);
      expect(harness.waitList).toHaveLength(1);
      expect(harness.driver.pressRaw).not.toHaveBeenCalled();
    },
  );

  it('④-2 key Tab 은 대기 없이 바로 pressRaw 를 부른다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(CONFIRM_BUTTON);
    await runScenario(harness, [pixel('key', { text: 'Tab' })]);
    expect(harness.ctx.waitForUser).not.toHaveBeenCalled();
    expect(harness.driver.pressRaw).toHaveBeenCalledWith({ key: 'Tab' });
  });

  it('⑥ key Return + 포커스 “결제하기” 면 대기하고 거부 시 pressRaw 를 부르지 않는다', async () => {
    const harness = createHarness('denied');
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(PAY_BUTTON);
    await runScenario(harness, [pixel('key', { text: 'Return' })]);
    expect(harness.waitList[0]).toMatchObject({ approval: { display: { action: 'Enter 키', target: '결제하기' } } });
    expect(harness.actCountAtWait).toEqual([0]);
    expect(harness.driver.pressRaw).not.toHaveBeenCalled();
  });

  it('⑥ key Return + 포커스 “결제하기” 에서 [에이전트가 누르기] 면 pressRaw 를 1회 부른다', async () => {
    const harness = createHarness('agent');
    vi.mocked(harness.driver.resolveTarget).mockResolvedValue(PAY_BUTTON);
    await runScenario(harness, [pixel('key', { text: 'Return' })]);
    expect(harness.driver.pressRaw).toHaveBeenCalledOnce();
  });

  it('repeat 만큼 pressRaw 를 부른다', async () => {
    const harness = createHarness();
    await runScenario(harness, [pixel('key', { text: 'Down', repeat: 3 })]);
    expect(harness.driver.pressRaw).toHaveBeenCalledTimes(3);
  });
});

describe('scroll · wait', () => {
  it('scroll 은 가드 없이 scrollAt 을 부르고 커서를 옮긴다', async () => {
    const harness = createHarness();
    vi.mocked(harness.driver.resolvePointTarget).mockResolvedValue(LOOKUP_BUTTON);
    await runScenario(harness, [
      pixel('scroll', { coordinate: [10, 20], scroll_direction: 'down', scroll_amount: 3 }),
      pixel('left_click', {}),
    ]);
    expect(harness.driver.scrollAt).toHaveBeenCalledWith({ x: 10, y: 20, direction: 'down', amount: 3 });
    expect(harness.driver.clickAt).toHaveBeenCalledWith({ x: 10, y: 20, count: 1 });
  });

  it('wait 은 드라이버를 부르지 않고 step 을 ok 로 남긴다', async () => {
    const harness = createHarness();
    await runScenario(harness, [pixel('wait', { duration: 0 })]);
    expect(harness.stepList[0]).toMatchObject({ tool: 'computer.wait', statusList: ['ok'] });
  });
});
