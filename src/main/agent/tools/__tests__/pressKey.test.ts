import { describe, expect, it } from 'vitest';

import { pressKeyTool } from '../pressKey';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('pressKeyTool', () => {
  it('모델에 보이는 이름은 press_key 이다', () => {
    expect(pressKeyTool.name).toBe('press_key');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(pressKeyTool.inputSchema.safeParse(getExampleInput(pressKeyTool.description)).success).toBe(true);
  });

  it('허용하지 않는 키은 입력 스키마가 거부한다', () => {
    expect(pressKeyTool.inputSchema.safeParse({ key: 'F5' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.pressKey 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = pressKeyTool.inputSchema.parse({ key: 'Enter' });
    await expect(pressKeyTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.pressKey).toHaveBeenCalledWith(input);
  });
});
