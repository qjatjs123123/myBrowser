import { AskUserInputSchema, type TAskUserInput } from '@shared/tools';

import type { IHumanTool, IHumanToolContext, THumanToolResult } from './toolType';

/** DB 에 남기는 답 자리 — 답변 원문은 저장하지 않는다 (SR-5) */
export const OMITTED_ANSWER = '[답변 생략]';

/** [ask_user] 빠지거나 애매한 정보를 사용자에게 묻는다 — 사이드바 질문 카드에 답이 오면 재개 */
export const askUserTool: IHumanTool<TAskUserInput> = {
  name: 'ask_user',
  description:
    'Ask the user one short question when something needed for the task is missing or ambiguous (date, time, party size, which option). ' +
    'Do not guess instead of asking. Offer up to 6 short choices in optionList when the answer is one of a few options; the user can also type freely. ' +
    'Never ask for passwords, card numbers, CVC or ID numbers — tell the user to type those into the page themselves. ' +
    'The run waits until the user answers. Example input: {"question":"몇 명으로 예약할까요?","optionList":["2명","4명"]}',
  inputSchema: AskUserInputSchema,
  isApprovalRequest: false,
  executeWithContext: (ctx, input) => askUser(ctx, input),
};

async function askUser(ctx: IHumanToolContext, input: TAskUserInput): Promise<THumanToolResult> {
  const answer = await ctx.waitForUser({
    kind: 'question',
    question: { stepN: ctx.stepN, text: input.question, optionList: input.optionList ?? [] },
  });
  if (answer.type !== 'answer') return { status: 'halted' };
  return { status: 'ok', text: `사용자 답: ${answer.answer}`, storedText: OMITTED_ANSWER };
}
