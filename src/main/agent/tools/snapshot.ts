import { SnapshotInputSchema, type TSnapshotInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [snapshot] 현재 대상 탭의 접근성 트리(ref 포함) */
export const snapshotTool: IAgentTool<TSnapshotInput> = {
  name: 'snapshot',
  description:
    'Read the current tab as an accessibility tree. The first line is "URL: … / 제목: …", then one line per element with a ref like [ref=e12]. ' +
    'Call this first on every page and again after anything that changes the page (navigate, click, typing with submit, switching tabs); ' +
    'every other tool that takes a ref must use a ref from the most recent snapshot. Output is cut at 12,000 characters — use scroll or read_text for more. ' +
    'Example input: {}',
  inputSchema: SnapshotInputSchema,
  execute: (driver) => driver.snapshot(),
};
