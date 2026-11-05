import { GoBackInputSchema, type TGoBackInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [go_back] 대상 탭 뒤로 가기 */
export const goBackTool: IAgentTool<TGoBackInput> = {
  name: 'go_back',
  description:
    'Go back one page in the current tab history, like the browser back button. Use it after following a wrong link. ' +
    'Refs from the previous snapshot are no longer valid — take a new snapshot. Example input: {}',
  inputSchema: GoBackInputSchema,
  execute: (driver) => driver.goBack(),
};
