import { ClickInputSchema, type TClickInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [click] ref 요소 클릭 — 확정·결제 대상이면 가드가 실행 전에 사용자 승인을 기다린다 */
export const clickTool: IAgentTool<TClickInput> = {
  name: 'click',
  description:
    'Click one element (link, button, checkbox, tab) by its ref from the most recent snapshot. Returns "클릭함" and the new URL if the page changed. ' +
    'Never invent refs and never reuse refs from an older snapshot. Clicking a final confirm, pay, order, send or delete button is held before the click ' +
    'and the user decides in an approval panel (click it themselves, let you click once, or deny) — read the tool result and continue accordingly. Example input: {"ref":"e12"}',
  inputSchema: ClickInputSchema,
  execute: (driver, input) => driver.click(input),
};
