import { SnapshotInputSchema, type TSnapshotInput } from '@shared/tools';

import type { IAgentTool } from './toolType';

/** [snapshot] 현재 대상 탭의 접근성 트리(ref 포함) */
export const snapshotTool: IAgentTool<TSnapshotInput> = {
  name: 'snapshot',
  description:
    'Read the current tab as an accessibility tree. The first line is "URL: … / 제목: …", then one line per element with a ref like [ref=e12] or [ref=f2e5] (f-prefixed refs are elements in a reloaded page or an iframe — use them as they are). ' +
    'If a dialog or popup layer is open it comes first, under "[열린 대화상자]". ' +
    'Call this first on every page and again after anything that changes the page (navigate, click, typing with submit, switching tabs); ' +
    'every other tool that takes a ref must use a ref from the most recent snapshot. The tree already includes content outside the viewport, so scrolling does not reveal more of it. ' +
    'Output is cut at 12,000 characters — then call snapshot with the ref of the part you need, e.g. {"ref": "e40"} for the dialog or list, to see just that subtree; after that only refs from that partial snapshot are valid. Use read_text for plain text. ' +
    'Example input: {}',
  inputSchema: SnapshotInputSchema,
  execute: (driver, input) => driver.snapshot(input),
};
