import { ClickInputSchema, type TClickInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [click] ref 요소 클릭 — 확정·결제 대상이면 가드가 실행 전에 run 을 멈춘다 */
export const clickTool: IAgentTool<TClickInput> = {
  name: 'click',
  description:
    'Click one element (link, button, checkbox, tab) by its ref from the most recent snapshot. Returns "클릭함" and the new URL if the page changed. ' +
    'Never invent refs and never reuse refs from an older snapshot. Clicking a final confirm, pay, order, send or delete button stops the run before the click ' +
    'so the user can do it themselves — stop and report instead of trying. Example input: {"ref":"e12"}',
  inputSchema: ClickInputSchema,
  execute: (driver, input) => driver.click(input),
};
