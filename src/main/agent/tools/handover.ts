import { findBlockScreenPhrase } from '../blockScreen';
import { noteAction, noteRepeat } from '../repeatTracker';
import { summarizeStep } from '../summary';
import type { IToolRunContext } from './index';

/** 반복·차단 화면 질문 선택지 (spec 026 FR-2·3) — 멈추기를 고르면 run 을 stopped 로 */
export const HANDOVER_OPTION = {
  repeatContinue: '다른 방법으로 계속',
  repeatStop: '여기서 멈추기 — 직접 할게요',
  blockStop: '직접 진행할게요 — 여기서 멈추기',
  blockResolved: '해결했어요 — 이어서 진행',
} as const;

/** 질문 step 의 답 자리 — 답 원문은 저장하지 않는다 (SR-3) */
const OMITTED_ANSWER = '[답변 생략]';
const WAITING_TEXT = '사용자 답 대기';
const QUESTION_MAX_LENGTH = 300;
const CYCLE_SHOWN_MAX = 4;

/** 화면이 달라도 묶음 반복에 넣는 상태 변경 도구 (FR-1) */
const ACTION_TOOL_SET: ReadonlySet<string> = new Set([
  'click',
  'type_text',
  'select_option',
  'press_key',
  'navigate',
  'go_back',
  'open_tab',
  'switch_tab',
]);
/** 차단 문구를 찾는 읽기 도구 (FR-3) */
const READ_TOOL_SET: ReadonlySet<string> = new Set(['snapshot', 'read_text']);

interface IAnnotateInput {
  tool: string;
  summary: string;
  value: string;
}

/**
 * [넘기기] 구조 도구 결과에 반복 안내를 붙이고, 차단 화면·반복이면 사용자에게 묻는다 (spec 026).
 * 한 결과에서 둘 다 걸리면 차단 질문 하나만 — 답이 멈추기가 아니면 반복 기록도 비운다.
 */
export async function annotateWithHandover(ctx: IToolRunContext, { tool, summary, value }: IAnnotateInput): Promise<string> {
  const repeat = noteRepeat(ctx.repeatTracker, { tool, summary, resultText: value });
  const cycle = ACTION_TOOL_SET.has(tool) ? noteAction(ctx.repeatTracker, `${tool}|${summary}`) : null;
  const text = value + repeat.notice;
  const block = READ_TOOL_SET.has(tool) ? await findNewBlockPhrase(ctx, value) : null;
  if (block !== null) return text + (await askHandover(ctx, toBlockQuestion(block)));
  if (repeat.shouldAsk || cycle) return text + (await askHandover(ctx, toRepeatQuestion(cycle ?? [`${tool}|${summary}`])));
  return text;
}

interface IHandoverQuestion {
  text: string;
  optionList: string[];
  stopOption: string;
}

/** 질문 step 을 남기고 답을 기다린다 — 멈추기면 run 을 끝내고, 아니면 반복 기록을 비우고 답을 붙인다 */
async function askHandover(ctx: IToolRunContext, question: IHandoverQuestion): Promise<string> {
  const n = ctx.beginStep({
    tool: 'ask_user',
    storedInput: { question: question.text },
    summary: summarizeStep('ask_user', { question: question.text }),
  });
  ctx.endStep(n, 'waiting', WAITING_TEXT);
  const answer = await ctx.waitForUser({
    kind: 'question',
    question: { stepN: n, text: question.text, optionList: question.optionList },
  });
  if (answer.type !== 'answer') return '';
  ctx.endStep(n, 'ok', OMITTED_ANSWER);
  if (answer.answer === question.stopOption) {
    ctx.stopByUser();
    return `\n[사용자 확인] 사용자가 멈추기를 골랐습니다`;
  }
  ctx.repeatTracker.reset();
  return `\n[사용자 확인] 같은 순서를 반복하지 않는다. 사용자 답: ${answer.answer}`;
}

/** 차단 문구가 있고 이 페이지·문구로 아직 묻지 않았으면 그 문구 — 물은 것으로 기록한다 */
async function findNewBlockPhrase(ctx: IToolRunContext, value: string): Promise<string | null> {
  const phrase = findBlockScreenPhrase(value);
  if (phrase === null) return null;
  const pageInfo = await ctx.driver.getPageInfo().catch(() => null);
  const key = `${toPagePath(pageInfo?.url ?? '')}|${phrase}`;
  if (ctx.repeatTracker.askedBlockKeySet.has(key)) return null;
  ctx.repeatTracker.askedBlockKeySet.add(key);
  return phrase;
}

/** URL 의 origin+경로 — 읽을 수 없으면 그대로 */
function toPagePath(url: string): string {
  return URL.canParse(url) ? `${new URL(url).origin}${new URL(url).pathname}` : url;
}

function toBlockQuestion(phrase: string): IHandoverQuestion {
  return {
    text: clip(`이 페이지가 자동 조작을 막는 화면을 보여 줍니다(“${phrase}”). 직접 진행해 주세요.`),
    optionList: [HANDOVER_OPTION.blockStop, HANDOVER_OPTION.blockResolved],
    stopOption: HANDOVER_OPTION.blockStop,
  };
}

function toRepeatQuestion(cycle: string[]): IHandoverQuestion {
  const shown = cycle.slice(0, CYCLE_SHOWN_MAX).map((key) => key.slice(key.indexOf('|') + 1));
  const more = cycle.length > CYCLE_SHOWN_MAX ? ' …' : '';
  return {
    text: clip(`같은 동작을 반복하고 있습니다: ${shown.join(' → ')}${more}. 어떻게 할까요?`),
    optionList: [HANDOVER_OPTION.repeatContinue, HANDOVER_OPTION.repeatStop],
    stopOption: HANDOVER_OPTION.repeatStop,
  };
}

function clip(text: string): string {
  return text.length > QUESTION_MAX_LENGTH ? `${text.slice(0, QUESTION_MAX_LENGTH - 1)}…` : text;
}
