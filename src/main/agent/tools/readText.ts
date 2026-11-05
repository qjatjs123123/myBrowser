import { ReadTextInputSchema, type TReadTextInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [read_text] 요소(없으면 본문) innerText */
export const readTextTool: IAgentTool<TReadTextInput> = {
  name: 'read_text',
  description:
    'Read the visible text of one element (by ref from the latest snapshot) or of the whole page body when ref is omitted, up to 4,000 characters. ' +
    'Use it when the snapshot line is too short to hold the information you need (prices, phone numbers, opening hours, long paragraphs). ' +
    'Do not use it to find refs — use snapshot for that. Example input: {"ref":"e12"}',
  inputSchema: ReadTextInputSchema,
  execute: (driver, input) => driver.readText(input),
};
