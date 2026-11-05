import { describe, expect, it } from 'vitest';

import { ALL_TOOL_NAME_LIST, HUMAN_TOOL_NAME_LIST } from '@shared/tools';

import { AGENT_TOOL_LIST } from '..';
import { isHumanTool, type TAnyAgentTool } from '../toolType';

const TOOL_LIST = AGENT_TOOL_LIST as readonly TAnyAgentTool[];

describe('IAgentTool·IHumanTool 계약', () => {
  it('도구 목록의 이름은 공유 도구 이름 목록 15개와 같다', () => {
    expect(TOOL_LIST.map((tool) => tool.name).sort()).toEqual([...ALL_TOOL_NAME_LIST].sort());
  });

  it('모든 도구는 설명에 예시 입력을 담고 입력 스키마를 가진다', () => {
    for (const tool of TOOL_LIST) {
      expect(tool.description).toMatch(/Example input: \{/);
      expect(typeof tool.inputSchema.safeParse).toBe('function');
    }
  });

  it('브라우저 도구는 execute 를, 사람 개입 도구는 executeWithContext 를 가진다', () => {
    for (const tool of TOOL_LIST) {
      if (isHumanTool(tool)) expect(typeof tool.executeWithContext).toBe('function');
      else expect(typeof tool.execute).toBe('function');
    }
  });

  it('사람 개입 도구로 분류되는 것은 ask_user·request_approval 뿐이다', () => {
    expect(TOOL_LIST.filter(isHumanTool).map((tool) => tool.name)).toEqual([...HUMAN_TOOL_NAME_LIST]);
  });
});
