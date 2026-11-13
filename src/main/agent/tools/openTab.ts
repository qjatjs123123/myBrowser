import { OpenTabInputSchema, type TOpenTabInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [open_tab] 새 탭을 활성으로 열고 대상 탭으로 삼는다 */
export const openTabTool: IAgentTool<TOpenTabInput> = {
  name: 'open_tab',
  description:
    'Open a new tab (optionally at an http(s) URL), make it active and the target of all later tools. ' +
    'Use it to compare pages side by side while keeping the current one; otherwise prefer navigate. ' +
    'The same URL rules as navigate apply. Example input: {"url":"https://www.google.com/"}',
  inputSchema: OpenTabInputSchema,
  execute: (driver, input) => driver.openTab(input),
};
