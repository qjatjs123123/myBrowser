import { describe, expect, it } from 'vitest';

import { scrollTool } from '../scroll';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('scrollTool', () => {
  it('모델에 보이는 이름은 scroll 이다', () => {
    expect(scrollTool.name).toBe('scroll');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(scrollTool.inputSchema.safeParse(getExampleInput(scrollTool.description)).success).toBe(true);
  });

  it('허용하지 않는 방향은 입력 스키마가 거부한다', () => {
    expect(scrollTool.inputSchema.safeParse({ direction: 'left' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.scroll 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = scrollTool.inputSchema.parse({ direction: 'down', amount: 'half' });
    await expect(scrollTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.scroll).toHaveBeenCalledWith(input);
  });
});
