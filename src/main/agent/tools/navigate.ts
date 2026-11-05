import { NavigateInputSchema, type TNavigateInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [navigate] 현재 대상 탭을 url 로 이동 — 가드가 스킴·host 를 검사 */
export const navigateTool: IAgentTool<TNavigateInput> = {
  name: 'navigate',
  description:
    'Open a full http(s) URL in the current tab and wait until the document is loaded. Returns the final URL and page title. ' +
    'Use it to go to a site or a search results URL you know; to follow a link that is already on the page, prefer click. ' +
    'file:, chrome:, javascript: and private or loopback addresses are blocked. Take a snapshot afterwards. ' +
    'Example input: {"url":"https://map.naver.com/"}',
  inputSchema: NavigateInputSchema,
  execute: (driver, input) => driver.navigate(input),
};
