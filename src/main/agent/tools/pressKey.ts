import { PressKeyInputSchema, type TPressKeyInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [press_key] 포커스된 요소에 키 입력 — Enter 는 가드가 포커스 대상으로 검사 */
export const pressKeyTool: IAgentTool<TPressKeyInput> = {
  name: 'press_key',
  description:
    'Press one key on the element that currently has focus: Enter, Escape, Tab, ArrowDown, ArrowUp, PageDown or PageUp. ' +
    'Use it for keyboard-only widgets (closing a popup with Escape, moving in an autocomplete list). To type text use type_text; to click use click. ' +
    'Enter on a confirm, pay or order button or form stops the run before the key is pressed. Example input: {"key":"Escape"}',
  inputSchema: PressKeyInputSchema,
  execute: (driver, input) => driver.pressKey(input),
};
