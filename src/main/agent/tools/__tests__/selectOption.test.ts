import { describe, expect, it } from 'vitest';

import { selectOptionTool } from '../selectOption';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('selectOptionTool', () => {
  it('모델에 보이는 이름은 select_option 이다', () => {
    expect(selectOptionTool.name).toBe('select_option');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(selectOptionTool.inputSchema.safeParse(getExampleInput(selectOptionTool.description)).success).toBe(true);
  });

  it('빈 선택 목록은 입력 스키마가 거부한다', () => {
    expect(selectOptionTool.inputSchema.safeParse({ ref: 'e8', valueList: [] }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.selectOption 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = selectOptionTool.inputSchema.parse({ ref: 'e8', valueList: ['2명'] });
    await expect(selectOptionTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.selectOption).toHaveBeenCalledWith(input);
  });
});
