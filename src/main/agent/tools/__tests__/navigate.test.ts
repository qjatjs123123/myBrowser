import { describe, expect, it } from 'vitest';

import { navigateTool } from '../navigate';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('navigateTool', () => {
  it('모델에 보이는 이름은 navigate 이다', () => {
    expect(navigateTool.name).toBe('navigate');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(navigateTool.inputSchema.safeParse(getExampleInput(navigateTool.description)).success).toBe(true);
  });

  it('URL 이 아닌 값은 입력 스키마가 거부한다', () => {
    expect(navigateTool.inputSchema.safeParse({ url: 'not a url' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.navigate 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = navigateTool.inputSchema.parse({ url: 'https://example.com/' });
    await expect(navigateTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.navigate).toHaveBeenCalledWith(input);
  });
});
