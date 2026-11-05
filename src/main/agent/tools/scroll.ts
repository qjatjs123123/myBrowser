import { ScrollInputSchema, type TScrollInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [scroll] 페이지 위·아래 스크롤 */
export const scrollTool: IAgentTool<TScrollInput> = {
  name: 'scroll',
  description:
    'Scroll the current page down or up by one screen (amount "page", default) or half a screen ("half"). ' +
    'Use it when the snapshot was cut off or content loads as you scroll, then take a new snapshot. Example input: {"direction":"down"}',
  inputSchema: ScrollInputSchema,
  execute: (driver, input) => driver.scroll(input),
};
