import { SelectOptionInputSchema, type TSelectOptionInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [select_option] ref select 요소에서 값 선택 */
export const selectOptionTool: IAgentTool<TSelectOptionInput> = {
  name: 'select_option',
  description:
    'Choose option(s) of a native <select> element (combobox in the snapshot) by ref from the latest snapshot. ' +
    'valueList holds option values or visible labels (1–10, more than one only for multi-selects). ' +
    'For custom dropdowns that are not <select>, click them instead. Example input: {"ref":"e8","valueList":["2명"]}',
  inputSchema: SelectOptionInputSchema,
  execute: (driver, input) => driver.selectOption(input),
};
