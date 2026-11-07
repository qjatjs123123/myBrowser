import { ScrollInputSchema, type TScrollInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [scroll] 페이지 위·아래 스크롤 */
export const scrollTool: IAgentTool<TScrollInput> = {
  name: 'scroll',
  description:
    'Scroll the current page down or up by one screen (amount "page", default) or half a screen ("half"). ' +
    'Use it only to load content that appears as you scroll (infinite lists) or to move the view; it does not reveal more of a cut-off snapshot (use snapshot with a ref for that). ' +
    'Take a new snapshot afterwards. Example input: {"direction":"down"}',
  inputSchema: ScrollInputSchema,
  execute: (driver, input) => driver.scroll(input),
};
