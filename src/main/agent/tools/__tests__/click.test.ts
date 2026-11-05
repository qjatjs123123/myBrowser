import { describe, expect, it } from 'vitest';

import { clickTool } from '../click';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('clickTool', () => {
  it('모델에 보이는 이름은 click 이다', () => {
    expect(clickTool.name).toBe('click');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(clickTool.inputSchema.safeParse(getExampleInput(clickTool.description)).success).toBe(true);
  });

  it('ref 형식이 아닌 값은 입력 스키마가 거부한다', () => {
    expect(clickTool.inputSchema.safeParse({ ref: 'button' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.click 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = clickTool.inputSchema.parse({ ref: 'e12' });
    await expect(clickTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.click).toHaveBeenCalledWith(input);
  });
});
