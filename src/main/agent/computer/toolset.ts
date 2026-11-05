/**
 * [픽셀 도구] SDK computer toolset(`computer_toolset_20260801`)의 브라우저 구현 (spec 004 FR-6·FR-7·SR-6).
 * 화면은 현재 대상 탭의 뷰포트, 좌표는 마지막 스크린샷 픽셀(변환은 드라이버). 멤버마다 구조 도구와 같은
 * runGuardedAction(정지·호출 수·step·가드·승인 대기·실행)을 탄다 — 승인 전에는 드라이버 행동을 부르지 않는다 (SR-1).
 * runGuardedAction 이 이미 ctx.runExclusive 안에서 돌므로 멤버에서 다시 감싸지 않는다(같은 큐 — 감싸면 교착).
 */
import { BetaAbstractComputerToolset20260801 } from '@anthropic-ai/sdk/helpers/beta/toolsets';
import type { BetaScreenshotResult, BetaToolsetCallContext } from '@anthropic-ai/sdk/helpers/beta/toolsets';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import type {
  BetaComputerDoubleClickInput,
  BetaComputerKeyInput,
  BetaComputerLeftClickInput,
  BetaComputerMouseMoveInput,
  BetaComputerScrollInput,
  BetaComputerTypeInput,
  BetaComputerWaitInput,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';

import type { IGuardTarget, IPoint, TActionResult } from '@shared/tools';

import { summarizeStep } from '../summary';
import {
  HALTED_RESULT,
  runGuardedAction,
  toStoredInput,
  type IGuardCall,
  type IToolRunContext,
  type TActOutcome,
} from '../tools';
import { toGuardCall, type TPixelMember } from './pixelGuard';

/** 모델에 돌려주는 차단 이유 */
export const PIXEL_MESSAGE = {
  noCursor: '커서 위치를 모릅니다. coordinate 를 함께 보내라',
  invalidCoordinate: '좌표 형식이 올바르지 않습니다. [x, y] 를 보내라',
  outOfViewport: '좌표가 현재 탭 화면 밖입니다. screenshot 의 크기 안에서 좌표를 고르라',
  modifierUnsupported: '보조 키(text)를 누른 채 하는 클릭·스크롤은 지원하지 않습니다',
} as const;

const MAX_KEY_REPEAT = 20;
const MAX_WAIT_SECONDS = 30;
const WAIT_TICK_MS = 100;

/** 실행했다는 표시 — act 의 value. 실행하지 않은 경우(HALTED·USER_DONE·DENIED)는 runGuardedAction 이 문자열을 돌려준다 */
interface IDone {
  done: true;
}
const DONE: IDone = { done: true };

/** 좌표 멤버 한 번의 명세 */
interface IPointAction {
  member: TPixelMember;
  input: unknown;
  coordinate: unknown;
  /** 가드를 거치는 클릭이면 true (scroll·mouse_move 는 가드 없음) */
  isGuarded: boolean;
  act: (point: IPoint) => Promise<TActionResult>;
}

/**
 * 브라우저 탭용 computer toolset — run 하나에 인스턴스 하나 (createToolList 가 만든다).
 * 마지막 커서 위치를 보관한다: 픽셀 left_click·double_click·mouse_move·scroll 이 실행에 성공했을 때만 갱신.
 */
export class BrowserComputerToolset extends BetaAbstractComputerToolset20260801 {
  readonly #ctx: IToolRunContext;
  #cursor: IPoint | null = null;

  constructor(ctx: IToolRunContext) {
    // SDK 는 type·key 를 켜면 confirm 을 요구한다. 판정·승인은 멤버 안 runGuardedAction(가드 + 사용자 승인)이 한다
    // — confirm: () => true 는 가드 우회가 아니라 SDK 의 별도 확인 단계를 우리 파이프라인에 맡긴다는 뜻이다.
    super({ configs: { zoom: { enabled: false } }, confirm: () => true });
    this.#ctx = ctx;
  }

  protected override async screenshot(): Promise<BetaScreenshotResult> {
    const result = await runGuardedAction(this.#ctx, {
      ...this.#plain('screenshot', {}),
      act: async (): Promise<TActOutcome<BetaScreenshotResult>> => {
        const shot = await this.#ctx.driver.takeScreenshot();
        if (!shot.ok) return shot;
        return {
          ok: true,
          value: { data: shot.pngBase64, mediaType: 'image/png' },
          text: `화면 ${shot.width}×${shot.height}`,
        };
      },
    });
    return unwrap(result);
  }

  protected override async left_click(_c: BetaToolsetCallContext, input: BetaComputerLeftClickInput): Promise<void> {
    await this.#click('left_click', input, 1);
  }

  protected override async double_click(
    _c: BetaToolsetCallContext,
    input: BetaComputerDoubleClickInput,
  ): Promise<void> {
    await this.#click('double_click', input, 2);
  }

  protected override async mouse_move(_c: BetaToolsetCallContext, input: BetaComputerMouseMoveInput): Promise<void> {
    const driver = this.#ctx.driver;
    await this.#runPointAction({
      member: 'mouse_move',
      input,
      coordinate: input.coordinate,
      isGuarded: false,
      act: (point) => driver.moveTo(point),
    });
  }

  protected override async scroll(_c: BetaToolsetCallContext, input: BetaComputerScrollInput): Promise<void> {
    if (input.text) return this.#block('scroll', input, PIXEL_MESSAGE.modifierUnsupported);
    const scrollInput = { direction: input.scroll_direction, amount: input.scroll_amount };
    const driver = this.#ctx.driver;
    await this.#runPointAction({
      member: 'scroll',
      input,
      coordinate: input.coordinate,
      isGuarded: false,
      act: (point) => driver.scrollAt({ ...point, ...scrollInput }),
    });
  }

  /** `type` 멤버 — 포커스 대상에 따라 가드 매핑이 바뀌므로(입력칸 → type_text, 그 밖 → click) 대상 해석 때마다 다시 정한다 */
  protected override async type_(_c: BetaToolsetCallContext, input: BetaComputerTypeInput): Promise<void> {
    const guard: IGuardCall = { tool: 'type_text', source: 'pixel', input: toGuardCall('type', input)?.input };
    const result = await runGuardedAction(this.#ctx, {
      ...this.#plain('type', input),
      storedInput: toStoredInput('type_text', input),
      guard,
      resolveTarget: () => this.#resolveTypeTarget(guard, input),
      act: async () => toDone(await this.#ctx.driver.typeRaw({ text: input.text })),
    });
    unwrap(result);
  }

  protected override async key(_c: BetaToolsetCallContext, input: BetaComputerKeyInput): Promise<void> {
    const call = toGuardCall('key', input);
    const repeat = Math.min(Math.max(input.repeat ?? 1, 1), MAX_KEY_REPEAT);
    const result = await runGuardedAction(this.#ctx, {
      ...this.#plain('key', input),
      guard: call ? { tool: call.tool, source: 'pixel', input: call.input } : null,
      resolveTarget: () => (call ? this.#ctx.driver.resolveTarget({ focused: true }) : Promise.resolve(null)),
      act: () => this.#pressRepeated(input.text, repeat),
    });
    unwrap(result);
  }

  protected override async wait(_c: BetaToolsetCallContext, input: BetaComputerWaitInput): Promise<void> {
    const seconds = Math.min(Math.max(input.duration, 0), MAX_WAIT_SECONDS);
    const result = await runGuardedAction(this.#ctx, {
      ...this.#plain('wait', input),
      act: async () => {
        await sleepUnlessHalted(seconds * 1000, () => this.#ctx.isHalted());
        return { ok: true, value: DONE, text: `${seconds}초 기다림` };
      },
    });
    unwrap(result);
  }

  async #click(member: 'left_click' | 'double_click', input: BetaComputerLeftClickInput, count: 1 | 2): Promise<void> {
    if (input.text) return this.#block(member, input, PIXEL_MESSAGE.modifierUnsupported);
    const driver = this.#ctx.driver;
    await this.#runPointAction({
      member,
      input,
      coordinate: input.coordinate,
      isGuarded: true,
      act: (point) => driver.clickAt({ ...point, count }),
    });
  }

  /** 좌표 멤버 — 좌표(없으면 커서)·뷰포트 확인(SR-6) 뒤 파이프라인. 성공하면 커서를 옮긴다 */
  async #runPointAction(action: IPointAction): Promise<void> {
    const point = await this.#checkPoint(action);
    const result = await runGuardedAction(this.#ctx, {
      ...this.#plain(action.member, action.input),
      guard: action.isGuarded ? { ...toPixelClickGuard(), point } : null,
      resolveTarget: () => (action.isGuarded ? this.#ctx.driver.resolvePointTarget(point) : Promise.resolve(null)),
      overlayTarget: action.isGuarded ? { point } : null,
      act: async () => {
        const outcome = toDone(await action.act(point));
        if (outcome.ok) this.#cursor = point;
        return outcome;
      },
    });
    unwrap(result);
  }

  /** 쓸 좌표를 정한다 — 없거나 뷰포트 밖이면 step blocked + ToolError. 큐 안에서 확인한다 */
  #checkPoint(action: IPointAction): Promise<IPoint> {
    return this.#ctx.runExclusive(async () => {
      const parsed = toPoint(action.coordinate);
      const point = parsed === 'missing' ? this.#cursor : parsed;
      if (point === 'invalid') return this.#blockInQueue(action.member, action.input, PIXEL_MESSAGE.invalidCoordinate);
      if (!point) return this.#blockInQueue(action.member, action.input, PIXEL_MESSAGE.noCursor);
      const isInside = await this.#ctx.driver.isInViewport(point).catch(() => false);
      if (!isInside) return this.#blockInQueue(action.member, action.input, PIXEL_MESSAGE.outOfViewport);
      return point;
    });
  }

  /**
   * type 의 대상 해석 — 포커스된 요소 **그 자체**(submit 대체 없음)로 가드 매핑을 다시 정하고(guard 를 갱신), 판정 대상을 돌려준다.
   * 그래야 폼 안의 비밀번호 칸을 비밀 입력으로 막고, 줄바꿈 제출은 그 칸의 formSubmitText 로 확정 검사한다.
   */
  async #resolveTypeTarget(guard: IGuardCall, input: BetaComputerTypeInput): Promise<IGuardTarget | null> {
    const focused = await this.#ctx.driver.resolveTarget({ focused: 'element' }).catch(() => null);
    const call = toGuardCall('type', input, focused);
    if (!call) return null;
    guard.tool = call.tool;
    guard.input = call.input;
    return call.target;
  }

  async #pressRepeated(key: string, repeat: number): Promise<TActOutcome<IDone>> {
    for (let i = 0; i < repeat; i += 1) {
      const result = await this.#ctx.driver.pressRaw({ key });
      if (!result.ok) return result;
    }
    return { ok: true, value: DONE, text: `키 ${key}` };
  }

  /** 가드 없는 기본 명세 — 멤버가 필요한 것만 덮어쓴다 */
  #plain(member: TPixelMember, input: unknown) {
    const stepTool = toStepTool(member);
    return {
      stepTool,
      guard: null,
      resolveTarget: () => Promise.resolve(null),
      summary: summarizeStep(stepTool, input),
      storedInput: input ?? {},
      overlayTarget: null,
    };
  }

  #block(member: TPixelMember, input: unknown, reason: string): Promise<never> {
    return this.#ctx.runExclusive(() => this.#blockInQueue(member, input, reason));
  }

  /** 실행 없이 step 을 blocked 로 남기고 모델에 is_error — 정지면 기록 없이 HALTED */
  async #blockInQueue(member: TPixelMember, input: unknown, reason: string): Promise<never> {
    const ctx = this.#ctx;
    if (ctx.isHalted() || !ctx.countToolCall()) throw new ToolError(HALTED_RESULT);
    const stepTool = toStepTool(member);
    const n = ctx.beginStep({ tool: stepTool, storedInput: input ?? {}, summary: summarizeStep(stepTool, input) });
    ctx.endStep(n, 'blocked', reason);
    throw new ToolError(reason);
  }
}

/** step 도구 이름 — `computer.{member}` */
export function toStepTool(member: TPixelMember): string {
  return `computer.${member}`;
}

function toPixelClickGuard(): Omit<IGuardCall, 'point'> {
  return { tool: 'click', source: 'pixel', input: {} };
}

/** 모델 좌표 → IPoint. 생략은 'missing'(커서 사용), 모양이 틀리면 'invalid' */
function toPoint(coordinate: unknown): IPoint | 'missing' | 'invalid' {
  if (coordinate === undefined || coordinate === null) return 'missing';
  if (!Array.isArray(coordinate) || coordinate.length !== 2) return 'invalid';
  const [x, y] = coordinate as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'invalid';
  return { x, y };
}

function toDone(result: TActionResult): TActOutcome<IDone> {
  return result.ok ? { ok: true, value: DONE, text: result.text } : result;
}

/**
 * runGuardedAction 결과 → 멤버 결과. 실행하지 않은 경우(정지·사용자가 직접 처리·거부)의 문자열은 ToolError 로 돌려준다
 * — SDK 는 순수 행동의 성공 결과 앞에 "Clicked." 같은 확인 문구를 붙이므로, 실행하지 않은 호출을 성공처럼 보이지 않게 한다.
 */
function unwrap<T>(result: T | string): T {
  if (typeof result === 'string') throw new ToolError(result);
  return result;
}

async function sleepUnlessHalted(ms: number, isHalted: () => boolean): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until && !isHalted()) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(WAIT_TICK_MS, until - Date.now())));
  }
}
