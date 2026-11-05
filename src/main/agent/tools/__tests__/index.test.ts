import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import { describe, expect, it, vi } from 'vitest';

import { STATEFUL_TOOL_NAME_LIST, TOOL_NAME_LIST, type IBrowserDriver, type TToolName } from '@shared/tools';

import { checkGuard } from '../../guard';
import { createToolList, toStoredInputJson, type IToolRunContext } from '../index';

vi.mock('../../guard', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../guard')>();
  return { ...original, checkGuard: vi.fn(original.checkGuard) };
});

/** 도구마다 통과하는 입력 */
const VALID_INPUT: Record<TToolName, Record<string, unknown>> = {
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

function createContext(): IToolRunContext {
  let n = 0;
  return {
    driver: createDriver(),
    allowedHostList: [],
    isHalted: () => false,
    countToolCall: () => true,
    beginStep: () => ++n,
    endStep: vi.fn(),
    stopBeforeConfirm: vi.fn(),
  };
}

/** 이름으로 실행 가능한 도구를 찾는다 (toolset 이 아닌 BetaRunnableTool) */
function findRunnable(ctx: IToolRunContext, name: TToolName): BetaRunnableTool {
  const tool = createToolList(ctx).find((item) => 'name' in item && item.name === name);
  if (!tool || !('parse' in tool)) throw new Error(`${name} 도구가 없다`);
  return tool;
}

describe('createToolList', () => {
  it('도구 이름 13개가 TOOL_NAME_LIST 와 같다', () => {
    expect(createToolList(createContext()).map((tool) => ('name' in tool ? tool.name : ''))).toEqual([
      ...TOOL_NAME_LIST,
    ]);
  });

  it('모든 도구가 eager_input_streaming 을 켠다', () => {
    for (const tool of createToolList(createContext())) {
      expect(tool).toMatchObject({ eager_input_streaming: true });
    }
  });

  it('모든 도구의 description 이 비어 있지 않다', () => {
    for (const tool of createToolList(createContext())) {
      expect('description' in tool ? tool.description : '').not.toBe('');
    }
  });

  it.each(TOOL_NAME_LIST)('%s 를 실행하면 상태 변경 도구일 때만 가드를 부른다', async (name) => {
    vi.mocked(checkGuard).mockClear();
    await findRunnable(createContext(), name).run(VALID_INPUT[name]);
    const isStateful = (STATEFUL_TOOL_NAME_LIST as readonly string[]).includes(name);
    expect(vi.mocked(checkGuard).mock.calls.length).toBe(isStateful ? 1 : 0);
  });

  it('정지 플래그가 서 있으면 실행도 기록도 하지 않는다', async () => {
    const ctx = { ...createContext(), isHalted: () => true, beginStep: vi.fn(() => 1) };
    await findRunnable(ctx, 'snapshot').run({});
    expect(ctx.driver.snapshot).not.toHaveBeenCalled();
    expect(ctx.beginStep).not.toHaveBeenCalled();
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
