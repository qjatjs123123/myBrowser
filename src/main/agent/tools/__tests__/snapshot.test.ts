import { describe, expect, it } from 'vitest';

import { snapshotTool } from '../snapshot';
import { createFakeDriver, FAKE_RESULT, getExampleInput } from './fakeDriver';

describe('snapshotTool', () => {
  it('모델에 보이는 이름은 snapshot 이다', () => {
    expect(snapshotTool.name).toBe('snapshot');
  });

  it('설명의 예시 입력은 입력 스키마를 통과한다', () => {
    expect(snapshotTool.inputSchema.safeParse(getExampleInput(snapshotTool.description)).success).toBe(true);
  });

  it('알 수 없는 키은 입력 스키마가 거부한다', () => {
    expect(snapshotTool.inputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('execute 는 driver.snapshot 를 부르고 그 결과를 돌려준다', async () => {
    const driver = createFakeDriver();
    await expect(snapshotTool.execute(driver, {})).resolves.toEqual(FAKE_RESULT);
    expect(driver.snapshot).toHaveBeenCalledOnce();
  });

  it('ref 를 주면 그 ref 를 driver.snapshot 에 넘긴다 (spec 015 FR-4)', async () => {
    const driver = createFakeDriver();
    await snapshotTool.execute(driver, { ref: 'e3' });
    expect(driver.snapshot).toHaveBeenCalledWith({ ref: 'e3' });
  });
});
