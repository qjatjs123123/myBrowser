import { ListTabsInputSchema, type TListTabsInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [list_tabs] 열린 탭 목록 */
export const listTabsTool: IAgentTool<TListTabsInput> = {
  name: 'list_tabs',
  description:
    'List the open browser tabs, one per line as "{tabId}{* if active} {title} — {url}". ' +
    'Use it when a link opened a new tab or you need to return to another tab; then call switch_tab with the tabId. Example input: {}',
  inputSchema: ListTabsInputSchema,
  execute: (driver) => driver.listTabs(),
};
