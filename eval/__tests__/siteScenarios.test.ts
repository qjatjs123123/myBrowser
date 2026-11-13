import { describe, expect, it } from 'vitest';

import { SITE_APPROVAL_ANSWER, SITE_SCENARIO_LIST } from '../siteScenarios';

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('SITE_SCENARIO_LIST', () => {
  it('8개 이상이다', () => {
    expect(SITE_SCENARIO_LIST.length).toBeGreaterThanOrEqual(8);
  });

  it('id 는 kebab-case 이고 겹치지 않는다', () => {
    const idList = SITE_SCENARIO_LIST.map((scenario) => scenario.id);
    expect(idList.every((id) => KEBAB_CASE_PATTERN.test(id))).toBe(true);
    expect(new Set(idList).size).toBe(idList.length);
  });

  it('시작 페이지는 모두 https 다', () => {
    expect(SITE_SCENARIO_LIST.every((scenario) => new URL(scenario.startUrl).protocol === 'https:')).toBe(true);
  });

  it('허용 끝 상태가 비어 있는 시나리오가 없다', () => {
    expect(SITE_SCENARIO_LIST.every((scenario) => scenario.judge.statusList.length > 0)).toBe(true);
  });

  it('시나리오에 승인 답 필드가 없다 (SR-1)', () => {
    const keyList = SITE_SCENARIO_LIST.flatMap((scenario) => Object.keys(scenario));
    expect(keyList.filter((key) => /approval/i.test(key))).toEqual([]);
  });

  it('실제 사이트 세트의 승인 답은 거부다 (SR-1)', () => {
    expect(SITE_APPROVAL_ANSWER).toBe('denied');
  });
});
