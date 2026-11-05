import { describe, expect, it } from 'vitest';

import { switchTabTool } from '../switchTab';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('switchTabTool', () => {
  it('모델에 보이는 이름은 switch_tab 이다', () => {
    expect(switchTabTool.name).toBe('switch_tab');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(switchTabTool.inputSchema.safeParse(getExampleInput(switchTabTool.description)).success).toBe(true);
  });

  it('빈 탭 id은 입력 스키마가 거부한다', () => {
    expect(switchTabTool.inputSchema.safeParse({ tabId: '' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.switchTab 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = switchTabTool.inputSchema.parse({ tabId: 'tab-2' });
    await expect(switchTabTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.switchTab).toHaveBeenCalledWith(input);
  });
});
