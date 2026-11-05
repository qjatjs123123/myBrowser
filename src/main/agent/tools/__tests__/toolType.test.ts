import { describe, expect, it } from 'vitest';

import { TOOL_NAME_LIST } from '@shared/tools';

import { AGENT_TOOL_LIST } from '..';
import type { IAgentTool } from '../toolType';

describe('IAgentTool 계약', () => {
  it('도구 목록의 이름은 공유 도구 이름 목록과 같다', () => {
    expect(AGENT_TOOL_LIST.map((tool) => tool.name).sort()).toEqual([...TOOL_NAME_LIST].sort());
  });

  it('모든 도구는 설명에 예시 입력을 담고 입력 스키마와 execute 를 가진다', () => {
    for (const tool of AGENT_TOOL_LIST as readonly IAgentTool<unknown>[]) {
      expect(tool.description).toMatch(/Example input: \{/);
      expect(typeof tool.inputSchema.safeParse).toBe('function');
      expect(typeof tool.execute).toBe('function');
    }
  });
});
