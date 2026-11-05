import { describe, expect, it } from 'vitest';

import { waitForTool } from '../waitFor';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('waitForTool', () => {
  it('모델에 보이는 이름은 wait_for 이다', () => {
    expect(waitForTool.name).toBe('wait_for');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(waitForTool.inputSchema.safeParse(getExampleInput(waitForTool.description)).success).toBe(true);
  });

  it('text·ms 가 모두 없는 입력은 입력 스키마가 거부한다', () => {
    expect(waitForTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.waitFor 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = waitForTool.inputSchema.parse({ text: '검색 결과' });
    await expect(waitForTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.waitFor).toHaveBeenCalledWith(input);
  });
});
