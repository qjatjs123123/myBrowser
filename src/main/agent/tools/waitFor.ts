import { WaitForInputSchema, type TWaitForInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [wait_for] 글이 나타날 때까지 또는 ms 만큼 대기 */
export const waitForTool: IAgentTool<TWaitForInput> = {
  name: 'wait_for',
  description:
    'Wait until the given text appears on the page (up to 10 seconds), or simply wait ms milliseconds (100–10000). Give at least one of text or ms. ' +
    'Use it after an action that loads results slowly; do not use it as a delay between every step. Example input: {"text":"검색 결과"}',
  inputSchema: WaitForInputSchema,
  execute: (driver, input) => driver.waitFor(input),
};
