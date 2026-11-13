import { TypeTextInputSchema, type TTypeTextInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [type_text] ref 입력칸에 글 입력 — 비밀 필드는 가드가 차단 */
export const typeTextTool: IAgentTool<TTypeTextInput> = {
  name: 'type_text',
  description:
    'Replace the text of an input or textarea (by ref from the latest snapshot) with the given text, up to 1,000 characters. ' +
    'Set submit to true to press Enter afterwards (for search boxes). Never type passwords, card numbers, CVC, resident registration numbers ' +
    'or one-time codes — those fields are blocked; ask the user to type them. Example input: {"ref":"e5","text":"강남역 맛집","submit":true}',
  inputSchema: TypeTextInputSchema,
  execute: (driver, input) => driver.typeText(input),
};
