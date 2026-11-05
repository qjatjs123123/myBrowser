import { describe, expect, it } from 'vitest';

import { readTextTool } from '../readText';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('readTextTool', () => {
  it('모델에 보이는 이름은 read_text 이다', () => {
    expect(readTextTool.name).toBe('read_text');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(readTextTool.inputSchema.safeParse(getExampleInput(readTextTool.description)).success).toBe(true);
  });

  it('ref 형식이 아닌 값은 입력 스키마가 거부한다', () => {
    expect(readTextTool.inputSchema.safeParse({ ref: 'x1' }).success).toBe(false);
  });

  it('execute 는 입력을 그대로 driver.readText 에 넘기고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    const input = readTextTool.inputSchema.parse({ ref: 'e3' });
    await expect(readTextTool.execute(driver, input)).resolves.toEqual(FAKE_RESULT);
    expect(driver.readText).toHaveBeenCalledWith(input);
  });
});
