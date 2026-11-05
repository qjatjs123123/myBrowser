import { describe, expect, it } from 'vitest';

import { goBackTool } from '../goBack';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('goBackTool', () => {
  it('모델에 보이는 이름은 go_back 이다', () => {
    expect(goBackTool.name).toBe('go_back');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(goBackTool.inputSchema.safeParse(getExampleInput(goBackTool.description)).success).toBe(true);
  });

  it('알 수 없는 키은 입력 스키마가 거부한다', () => {
    expect(goBackTool.inputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('execute 는 driver.goBack 를 부르고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    await expect(goBackTool.execute(driver, {})).resolves.toEqual(FAKE_RESULT);
    expect(driver.goBack).toHaveBeenCalledOnce();
  });
});
