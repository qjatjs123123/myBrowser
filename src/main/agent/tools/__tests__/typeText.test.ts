import { describe, expect, it } from 'vitest';

import { typeTextTool } from '../typeText';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('typeTextTool', () => {
  it('모델에 보이는 이름은 type_text 이다', () => {
    expect(typeTextTool.name).toBe('type_text');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(typeTextTool.inputSchema.safeParse(getExampleInput(typeTextTool.description)).success).toBe(true);
  });

  it('1000자를 넘는 글은 입력 스키마가 거부한다', () => {
    expect(typeTextTool.inputSchema.safeParse({ ref: 'e5', text: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.typeText 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = typeTextTool.inputSchema.parse({ ref: 'e5', text: '강남역', submit: true });
    await expect(typeTextTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.typeText).toHaveBeenCalledWith(input);
  });
});
