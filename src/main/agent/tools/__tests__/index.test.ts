import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import { describe, expect, it, vi } from 'vitest';

import {
  ALL_TOOL_NAME_LIST,
  HUMAN_TOOL_NAME_LIST,
  STATEFUL_TOOL_NAME_LIST,
  TOOL_NAME_LIST,
  type IBrowserDriver,
  type TAllToolName,
} from '@shared/tools';

import { BrowserComputerToolset } from '../../computer/toolset';
import { checkGuard } from '../../guard';
import type { TWaitAnswer } from '../../waits';
import {
  createExclusiveQueue,
  createToolList,
  HALTED_RESULT,
  runGuardedAction,
  toStoredInputJson,
  type IToolRunContext,
} from '../index';

vi.mock('../../guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../guard')>();
  return { ...original, checkGuard: vi.fn(original.checkGuard) };
});

/** 도구마다 통과하는 입력 */
const VALID_INPUT: Record<TAllToolName, Record<string, unknown>> = {
  snapshot: {},
  read_text: {},
  navigate: { url: 'https://example.com/' },
  go_back: {},
  click: { ref: 'e1' },
  type_text: { ref: 'e1', text: 'a' },
  select_option: { ref: 'e1', valueList: ['a'] },
  press_key: { key: 'Escape' },
  scroll: { direction: 'down' },
  wait_for: { ms: 100 },
  list_tabs: {},
  switch_tab: { tabId: 't1' },
  open_tab: {},
  ask_user: { question: '몇 명인가요?' },
  request_approval: { action: '변경', target: '', reason: '확인' },
};

function createDriver(): IBrowserDriver {
  const ok = vi.fn(async () => ({ ok: true as const, text: '완료' }));
  const target = { role: 'button', name: '보기', text: '', value: '', href: '', formAction: '', formSubmitText: '' };
  return {
    snapshot: ok,
    readText: ok,
    navigate: ok,
    goBack: ok,
    click: ok,
    typeText: ok,
    selectOption: ok,
    pressKey: ok,
    scroll: ok,
    waitFor: ok,
    listTabs: ok,
    switchTab: ok,
    openTab: ok,
    resolveTarget: vi.fn(async () => ({
      ...target,
      inputType: '',
      autocomplete: '',
      fieldName: '',
      label: '',
      pageUrl: '',
    })),
    getPageInfo: vi.fn(async () => ({ url: 'https://example.com/', title: '예시' })),
    takeScreenshot: vi.fn(async () => ({ ok: true as const, pngBase64: '', width: 1280, height: 800 })),
    clickAt: ok,
    typeRaw: ok,
    pressRaw: ok,
    scrollAt: ok,
    moveTo: ok,
    resolvePointTarget: vi.fn(async () => null),
    isInViewport: vi.fn(async () => true),
    showOverlay: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}

const APPROVED: TWaitAnswer = { type: 'decision', decision: 'approved' };

function createContext(): IToolRunContext {
  let n = 0;
  return {
    driver: createDriver(),
    allowedHostList: [],
    approvalCount: 0,
    isHalted: () => false,
    countToolCall: () => true,
    beginStep: () => ++n,
    endStep: vi.fn(),
    // spec 004: stopBeforeConfirm(run 정지) 대신 사용자 대기 — 사람 개입 도구는 바로 답을 받는다
    waitForUser: vi.fn(async (request) =>
      request.kind === 'question' ? { type: 'answer' as const, answer: '2명' } : APPROVED,
    ),
    overlay: vi.fn(async () => undefined),
    runExclusive: createExclusiveQueue(),
  };
}

/** 이름으로 실행 가능한 도구를 찾는다 (toolset 이 아닌 BetaRunnableTool) */
function findRunnable(ctx: IToolRunContext, name: TAllToolName): BetaRunnableTool {
  const tool = createToolList(ctx).find((item) => 'name' in item && item.name === name);
  if (!tool || !('parse' in tool)) throw new Error(`${name} 도구가 없다`);
  return tool;
}

/** toolset 을 뺀 betaZodTool 목록 */
function getZodToolList(ctx: IToolRunContext): BetaRunnableTool[] {
  return createToolList(ctx).filter((item): item is BetaRunnableTool => 'name' in item && 'parse' in item);
}

describe('createToolList', () => {
  it('도구 이름 15개가 ALL_TOOL_NAME_LIST 와 같다', () => {
    expect(getZodToolList(createContext()).map((tool) => tool.name)).toEqual([...ALL_TOOL_NAME_LIST]);
  });

  it('목록 끝에 픽셀 computer toolset 1개가 붙는다 (spec 004 Task 7)', () => {
    const toolList = createToolList(createContext());
    expect(toolList).toHaveLength(ALL_TOOL_NAME_LIST.length + 1);
    expect(toolList.at(-1)).toBeInstanceOf(BrowserComputerToolset);
  });

  it('모든 도구가 eager_input_streaming 을 켠다', () => {
    for (const tool of getZodToolList(createContext())) {
      expect(tool).toMatchObject({ eager_input_streaming: true });
    }
  });

  it('모든 도구의 description 이 비어 있지 않다', () => {
    for (const tool of getZodToolList(createContext())) {
      expect('description' in tool ? tool.description : '').not.toBe('');
    }
  });

  it.each(TOOL_NAME_LIST)('%s 를 실행하면 상태 변경 도구일 때만 가드를 부른다', async (name) => {
    vi.mocked(checkGuard).mockClear();
    await findRunnable(createContext(), name).run(VALID_INPUT[name]);
    const isStateful = (STATEFUL_TOOL_NAME_LIST as readonly string[]).includes(name);
    expect(vi.mocked(checkGuard).mock.calls.length).toBe(isStateful ? 1 : 0);
  });

  it.each(HUMAN_TOOL_NAME_LIST)('사람 개입 도구 %s 는 구조 가드·드라이버를 부르지 않고 사용자 대기로 답한다', async (name) => {
    vi.mocked(checkGuard).mockClear();
    const ctx = createContext();
    const result = await findRunnable(ctx, name).run(VALID_INPUT[name]);
    expect(result).toBe(name === 'ask_user' ? '사용자 답: 2명' : 'approved');
    expect(ctx.waitForUser).toHaveBeenCalledOnce();
    expect(ctx.driver.resolveTarget).not.toHaveBeenCalled();
    const toolList = vi.mocked(checkGuard).mock.calls.map(([guardInput]) => guardInput.tool);
    expect(toolList).toEqual(name === 'request_approval' ? ['request_approval'] : []);
  });

  it('request_approval 은 승인 수를 1 늘리고 kind=model 요청에 모델 문장을 modelNote 로만 싣는다', async () => {
    const ctx = createContext();
    await findRunnable(ctx, 'request_approval').run({ action: '변경', target: '인원', reason: '자리 없음' });
    expect(ctx.approvalCount).toBe(1);
    expect(ctx.waitForUser).toHaveBeenCalledWith({
      kind: 'approval',
      approval: {
        stepN: 1,
        kind: 'model',
        source: 'model',
        reason: expect.any(String),
        display: { action: '확인 요청', target: '' },
        modelNote: '변경 — 인원: 자리 없음',
      },
    });
  });

  it('request_approval 이 상한을 넘으면 대기 없이 is_error 로 차단한다', async () => {
    const ctx = { ...createContext(), approvalCount: 5 };
    await expect(findRunnable(ctx, 'request_approval').run(VALID_INPUT.request_approval)).rejects.toThrow(
      /too_many_approvals/,
    );
    expect(ctx.waitForUser).not.toHaveBeenCalled();
    expect(ctx.endStep).toHaveBeenCalledWith(1, 'blocked', expect.stringContaining('too_many_approvals'));
  });

  it('ask_user 의 step 결과에는 답변 원문 대신 생략 표시를 남긴다', async () => {
    const ctx = createContext();
    await findRunnable(ctx, 'ask_user').run(VALID_INPUT.ask_user);
    expect(ctx.endStep).toHaveBeenLastCalledWith(1, 'ok', '[답변 생략]');
  });

  it('정지 플래그가 서 있으면 실행도 기록도 하지 않는다', async () => {
    const ctx = { ...createContext(), isHalted: () => true, beginStep: vi.fn(() => 1) };
    await findRunnable(ctx, 'snapshot').run({});
    expect(ctx.driver.snapshot).not.toHaveBeenCalled();
    expect(ctx.beginStep).not.toHaveBeenCalled();
  });
});

describe('runGuardedAction', () => {
  const baseSpec = {
    guard: null,
    resolveTarget: async () => null,
    summary: '화면 보기',
    storedInput: {},
    overlayTarget: null,
  };

  it('가드가 없으면 act 결과의 value 를 돌려주고 step 을 ok 로 기록한다', async () => {
    const ctx = createContext();
    const act = vi.fn(async () => ({ ok: true as const, value: { image: 1 }, text: '스크린샷' }));
    expect(await runGuardedAction(ctx, { ...baseSpec, stepTool: 'computer.screenshot', act })).toEqual({ image: 1 });
    expect(ctx.endStep).toHaveBeenCalledWith(1, 'ok', '스크린샷');
  });

  it('정지 플래그가 서 있으면 act 를 부르지 않고 HALTED 결과다', async () => {
    const ctx = { ...createContext(), isHalted: () => true };
    const act = vi.fn(async () => ({ ok: true as const, value: 'x', text: 'x' }));
    expect(await runGuardedAction(ctx, { ...baseSpec, stepTool: 'computer.wait', act })).toBe(HALTED_RESULT);
    expect(act).not.toHaveBeenCalled();
  });

  it('구조 도구가 승인 대기 중이면 같은 ctx 의 다른 runGuardedAction(픽셀)은 시작하지 않는다', async () => {
    const ctx = createContext();
    vi.mocked(ctx.driver.resolveTarget).mockResolvedValue({
      role: 'button',
      name: '예약 확정',
      text: '',
      value: '',
      href: '',
      formAction: '',
      formSubmitText: '',
      inputType: '',
      autocomplete: '',
      fieldName: '',
      label: '',
      pageUrl: 'https://example.com/',
    });
    let release: (answer: TWaitAnswer) => void = () => undefined;
    ctx.waitForUser = vi.fn(() => new Promise<TWaitAnswer>((resolve) => (release = resolve)));
    const first = findRunnable(ctx, 'click').run({ ref: 'e1' });
    await vi.waitFor(() => expect(ctx.waitForUser).toHaveBeenCalled());
    const pixelResolve = vi.fn(async () => null);
    const pixelAct = vi.fn(async () => ({ ok: true as const, value: '완료', text: '완료' }));
    const second = runGuardedAction(ctx, {
      ...baseSpec,
      stepTool: 'computer.left_click',
      resolveTarget: pixelResolve,
      act: pixelAct,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pixelResolve).not.toHaveBeenCalled();
    expect(pixelAct).not.toHaveBeenCalled();
    expect(ctx.driver.click).not.toHaveBeenCalled();
    release({ type: 'decision', decision: 'denied' });
    await first;
    await second;
    expect(pixelAct).toHaveBeenCalledOnce();
    expect(ctx.driver.click).not.toHaveBeenCalled();
  });
});

describe('toStoredInputJson', () => {
  it('type_text 의 text 는 생략 표시로 바꾼다', () => {
    expect(toStoredInputJson('type_text', { ref: 'e1', text: '비밀', submit: true })).toBe(
      '{"ref":"e1","text":"[입력값 생략]","submit":true}',
    );
  });

  it('다른 도구는 입력을 그대로 JSON 으로 만든다', () => {
    expect(toStoredInputJson('click', { ref: 'e1' })).toBe('{"ref":"e1"}');
  });
});
