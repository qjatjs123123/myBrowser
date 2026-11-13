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
import { createRepeatTracker } from '../../repeatTracker';
import { HANDOVER_OPTION } from '../handover';
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
    repeatTracker: createRepeatTracker(),
    stopByUser: vi.fn(),
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

  it('hasComputerToolset false 면 픽셀 computer toolset 없이 15개다 (spec 007 FR-5)', () => {
    const toolList = createToolList(createContext(), { hasComputerToolset: false });
    expect(toolList).toHaveLength(ALL_TOOL_NAME_LIST.length);
    expect(toolList.some((tool) => tool instanceof BrowserComputerToolset)).toBe(false);
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

  it.each(HUMAN_TOOL_NAME_LIST)(
    '사람 개입 도구 %s 는 구조 가드·드라이버를 부르지 않고 사용자 대기로 답한다',
    async (name) => {
      vi.mocked(checkGuard).mockClear();
      const ctx = createContext();
      const result = await findRunnable(ctx, name).run(VALID_INPUT[name]);
      expect(result).toBe(name === 'ask_user' ? '사용자 답: 2명' : 'approved');
      expect(ctx.waitForUser).toHaveBeenCalledOnce();
      expect(ctx.driver.resolveTarget).not.toHaveBeenCalled();
      const toolList = vi.mocked(checkGuard).mock.calls.map(([guardInput]) => guardInput.tool);
      expect(toolList).toEqual(name === 'request_approval' ? ['request_approval'] : []);
    },
  );

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

describe('반복 안내 (spec 015 FR-5)', () => {
  it('같은 화면에서 같은 click 을 세 번째 하면 결과 끝에 안내를 붙이고 step 기록에는 남기지 않는다', async () => {
    const ctx = createContext();
    const click = findRunnable(ctx, 'click');
    await findRunnable(ctx, 'snapshot').run({});
    await click.run({ ref: 'e1' });
    expect(await click.run({ ref: 'e2' })).toBe('완료');
    const third = await click.run({ ref: 'e3' });
    expect(third).toMatch(/^완료\n\[반복 3회째\]/);
    expect(ctx.endStep).toHaveBeenLastCalledWith(4, 'ok', '완료');
  });

  it('실패한 결과에는 안내를 붙이지 않는다', async () => {
    const ctx = createContext();
    vi.mocked(ctx.driver.click).mockResolvedValue({ ok: false, reason: '시간 초과' });
    const click = findRunnable(ctx, 'click');
    for (let i = 0; i < 2; i += 1) await Promise.resolve(click.run({ ref: 'e1' })).catch(() => undefined);
    await expect(click.run({ ref: 'e1' })).rejects.toThrow(/^시간 초과$/);
  });
});

describe('클릭 화면 변화·반복 중단 (spec 024)', () => {
  it('note 는 모델 결과에만 붙고 step 기록 text 에는 없다', async () => {
    const ctx = createContext();
    vi.mocked(ctx.driver.click).mockResolvedValue({ ok: true, text: '클릭함', note: '\n화면 변화: 나타남 1줄 — 오후 7:00' });
    const result = await findRunnable(ctx, 'click').run({ ref: 'e1' });
    expect(result).toBe('클릭함\n화면 변화: 나타남 1줄 — 오후 7:00');
    expect(ctx.endStep).toHaveBeenLastCalledWith(1, 'ok', '클릭함');
  });

});

describe('반복·차단 화면 넘기기 (spec 026)', () => {
  /** 질문 답을 정해 둔 ctx — 질문 요청을 모은다 */
  function createHandoverContext(answer: string) {
    const ctx = createContext();
    const questionList: string[] = [];
    vi.mocked(ctx.waitForUser).mockImplementation(async (request) => {
      if (request.kind === 'question') questionList.push(request.question.text);
      return { type: 'answer', answer };
    });
    return { ctx, questionList };
  }
  const BLOCK_TEXT = 'URL: https://k.com/a / 제목: k\n- paragraph: 매크로, 개발자도구 등 미허가 도구 사용 시 이용이 제한될 수 있습니다.';

  it('같은 화면에서 같은 click 5회째면 묻고, 계속이면 결과 끝에 사용자 확인을 붙이고 횟수를 비운다', async () => {
    const { ctx, questionList } = createHandoverContext(HANDOVER_OPTION.repeatContinue);
    const click = findRunnable(ctx, 'click');
    await findRunnable(ctx, 'snapshot').run({});
    for (let i = 0; i < 4; i += 1) await click.run({ ref: 'e1' });
    expect(questionList).toEqual([]);
    const fifth = await click.run({ ref: 'e1' });
    expect(questionList).toHaveLength(1);
    expect(questionList[0]).toContain('같은 동작을 반복하고 있습니다');
    expect(fifth).toMatch(/\[반복 5회째\] 같은 행동·화면이 반복돼 사용자에게 확인합니다\n\[사용자 확인\] 같은 순서를 반복하지 않는다/);
    expect(ctx.stopByUser).not.toHaveBeenCalled();
    expect(await click.run({ ref: 'e1' })).toBe('완료');
  });

  it('멈추기를 고르면 stopByUser 를 부른다', async () => {
    const { ctx } = createHandoverContext(HANDOVER_OPTION.repeatStop);
    const click = findRunnable(ctx, 'click');
    await findRunnable(ctx, 'snapshot').run({});
    for (let i = 0; i < 5; i += 1) await click.run({ ref: 'e1' });
    expect(ctx.stopByUser).toHaveBeenCalledOnce();
  });

  it('click A → click B 묶음이 3번이면(화면이 달라도) 묻는다', async () => {
    const { ctx, questionList } = createHandoverContext(HANDOVER_OPTION.repeatContinue);
    vi.mocked(ctx.driver.resolveTarget).mockImplementation(async (req) => ({
      role: 'button',
      name: 'ref' in req && req.ref === 'e1' ? '30' : '레이어닫기',
      text: '',
      value: '',
      href: '',
      formAction: '',
      formSubmitText: '',
      inputType: '',
      autocomplete: '',
      fieldName: '',
      label: '',
      pageUrl: '',
    }));
    let page = 0;
    vi.mocked(ctx.driver.snapshot).mockImplementation(async () => ({ ok: true, text: `화면 ${String(++page)}` }));
    for (let round = 0; round < 3; round += 1) {
      await findRunnable(ctx, 'snapshot').run({});
      await findRunnable(ctx, 'click').run({ ref: 'e1' });
      await findRunnable(ctx, 'click').run({ ref: 'e2' });
    }
    expect(questionList).toHaveLength(1);
    expect(questionList[0]).toContain('‘30’ 클릭 → ‘레이어닫기’ 클릭');
  });

  it('snapshot 에 차단 문구가 있으면 묻고, 같은 페이지·문구는 다시 묻지 않는다 (reset 뒤에도)', async () => {
    const { ctx, questionList } = createHandoverContext(HANDOVER_OPTION.blockResolved);
    vi.mocked(ctx.driver.snapshot).mockResolvedValue({ ok: true, text: BLOCK_TEXT });
    const snapshot = findRunnable(ctx, 'snapshot');
    const first = await snapshot.run({});
    expect(questionList[0]).toContain('자동 조작을 막는 화면');
    expect(first).toContain('[사용자 확인] 같은 순서를 반복하지 않는다. 사용자 답: 해결했어요');
    await snapshot.run({});
    expect(questionList).toHaveLength(1);
  });

  it('질문 step 은 ask_user 로 남고 답 원문은 저장하지 않는다', async () => {
    const { ctx } = createHandoverContext(HANDOVER_OPTION.blockStop);
    const beginStep = vi.spyOn(ctx, 'beginStep');
    vi.mocked(ctx.driver.snapshot).mockResolvedValue({ ok: true, text: BLOCK_TEXT });
    await findRunnable(ctx, 'snapshot').run({});
    expect(beginStep).toHaveBeenLastCalledWith(expect.objectContaining({ tool: 'ask_user' }));
    expect(ctx.endStep).toHaveBeenLastCalledWith(2, 'ok', '[답변 생략]');
    expect(ctx.stopByUser).toHaveBeenCalledOnce();
  });

  it('차단 문구와 반복이 한 결과에서 함께 걸리면 차단 질문 하나만 묻고 반복 기록도 비운다', async () => {
    const { ctx, questionList } = createHandoverContext(HANDOVER_OPTION.blockResolved);
    vi.mocked(ctx.driver.snapshot).mockResolvedValue({ ok: true, text: BLOCK_TEXT });
    vi.mocked(ctx.driver.getPageInfo).mockImplementation(async () => ({ url: `https://k.com/${String(Math.random())}`, title: '' }));
    const snapshot = findRunnable(ctx, 'snapshot');
    for (let i = 0; i < 4; i += 1) await snapshot.run({});
    questionList.length = 0;
    await snapshot.run({});
    expect(questionList).toHaveLength(1);
    expect(questionList[0]).toContain('자동 조작을 막는 화면');
    expect(ctx.repeatTracker.actionList).toEqual([]);
  });

  it('질문 중 중지되면(cancelled) 사용자 확인을 붙이지 않는다', async () => {
    const ctx = createContext();
    vi.mocked(ctx.waitForUser).mockResolvedValue({ type: 'cancelled', reason: 'stopped' });
    vi.mocked(ctx.driver.snapshot).mockResolvedValue({ ok: true, text: BLOCK_TEXT });
    const result = await findRunnable(ctx, 'snapshot').run({});
    expect(result).not.toContain('[사용자 확인]');
  });
});

describe('하위 프레임 f-ref 의 승인 (spec 015 SR-1·SR-3)', () => {
  /** 대상 해석이 iframe 안 버튼을 돌려주는 ctx — 승인 대기는 거부로 답한다 */
  function createFrameContext(name: string, topUrl: string) {
    const ctx = createContext();
    vi.mocked(ctx.driver.resolveTarget).mockResolvedValue({
      role: 'button',
      name,
      text: '',
      value: '',
      href: '',
      formAction: '',
      formSubmitText: '',
      inputType: '',
      autocomplete: '',
      fieldName: '',
      label: '',
      pageUrl: 'about:srcdoc',
    });
    vi.mocked(ctx.driver.getPageInfo).mockResolvedValue({ url: topUrl, title: '결제' });
    let release: (answer: TWaitAnswer) => void = () => undefined;
    ctx.waitForUser = vi.fn(() => new Promise<TWaitAnswer>((resolve) => (release = resolve)));
    return { ctx, deny: () => release({ type: 'decision', decision: 'denied' }) };
  }

  it('iframe 안 “예약 확정” 을 f-ref 로 누르면 승인 대기에서 멈추고 거부하면 클릭하지 않는다', async () => {
    const { ctx, deny } = createFrameContext('예약 확정', 'https://shop.example.com/store');
    const pending = findRunnable(ctx, 'click').run({ ref: 'f1e3' });
    await vi.waitFor(() => expect(ctx.waitForUser).toHaveBeenCalled());
    expect(ctx.endStep).toHaveBeenCalledWith(1, 'waiting', expect.any(String));
    expect(ctx.driver.click).not.toHaveBeenCalled();
    deny();
    await pending;
    expect(ctx.driver.click).not.toHaveBeenCalled();
  });

  it('최상위 탭이 /checkout 이면 iframe 안 평범한 [다음] 도 승인 전에는 클릭하지 않는다', async () => {
    const { ctx, deny } = createFrameContext('다음', 'https://shop.example.com/checkout');
    const pending = findRunnable(ctx, 'click').run({ ref: 'f1e4' });
    await vi.waitFor(() => expect(ctx.waitForUser).toHaveBeenCalled());
    expect(ctx.driver.click).not.toHaveBeenCalled();
    deny();
    await pending;
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
