import { describe, expect, it } from 'vitest';

import { openTabTool } from '../openTab';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('openTabTool', () => {
  it('모델에 보이는 이름은 open_tab 이다', () => {
    expect(openTabTool.name).toBe('open_tab');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(openTabTool.inputSchema.safeParse(getExampleInput(openTabTool.description)).success).toBe(true);
  });

  it('URL 이 아닌 값은 입력 스키마가 거부한다', () => {
    expect(openTabTool.inputSchema.safeParse({ url: 'javascript' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.openTab 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = openTabTool.inputSchema.parse({ url: 'https://example.com/' });
    await expect(openTabTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.openTab).toHaveBeenCalledWith(input);
  });
});
