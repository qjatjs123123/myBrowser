import { SwitchTabInputSchema, type TSwitchTabInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [switch_tab] 대상 탭 전환 (화면 활성 탭도 전환) */
export const switchTabTool: IAgentTool<TSwitchTabInput> = {
  name: 'switch_tab',
  description:
    'Make another open tab the target of all later tools and show it to the user. tabId comes from list_tabs. ' +
    'Take a snapshot after switching. Example input: {"tabId":"tab-2"}',
  inputSchema: SwitchTabInputSchema,
  execute: (driver, input) => driver.switchTab(input),
};
