import { describe, expect, it } from 'vitest';

import {
  convertSiteToMarkdown,
  type ISiteJudge,
  type ISiteObserved,
  judgeSiteRun,
  parseSiteResultLines,
  SITE_JUDGEMENT,
  summarizeSiteResults,
  type TSiteResult,
} from '../siteJudge';

const JUDGE: ISiteJudge = { statusList: ['done'], keywordList: ['KTX'], urlPattern: /korail\.com/, minApprovals: 1 };

/** 판정 규칙을 모두 만족하는 관찰값 */
function createObserved(patch: Partial<ISiteObserved> = {}): ISiteObserved {
  return { status: 'done', answer: '첫 KTX 는 05:13', endUrl: 'https://www.letskorail.com/x', approvals: 1, ...patch };
}

/** 결과 줄 1개 */
function createResult(patch: Partial<TSiteResult> = {}): TSiteResult {
  return {
    id: 'korail',
    n: 1,
    judgement: SITE_JUDGEMENT.success,
    status: 'done',
    answer: 'KTX',
    endUrl: 'https://www.letskorail.com',
    toolCalls: 10,
    approvals: 0,
    inputTokens: 1000,
    outputTokens: 100,
    durationMs: 2000,
    ...patch,
  };
}

describe('judgeSiteRun', () => {
  it('상태·낱말·URL·승인이 모두 맞으면 성공이다', () => {
    expect(judgeSiteRun(JUDGE, createObserved())).toBe(SITE_JUDGEMENT.success);
  });

  it('끝 상태가 허용 목록에 없으면 실패다', () => {
    expect(judgeSiteRun(JUDGE, createObserved({ status: 'failed' }))).toBe(SITE_JUDGEMENT.fail);
  });

  it('실행 오류가 있으면 상태가 맞아도 실패다', () => {
    expect(judgeSiteRun(JUDGE, createObserved({ error: '시작 페이지 열기 실패' }))).toBe(SITE_JUDGEMENT.fail);
  });

  it('상태는 맞는데 낱말이 없으면 확인 필요다', () => {
    expect(judgeSiteRun(JUDGE, createObserved({ answer: '열차가 없습니다' }))).toBe(SITE_JUDGEMENT.review);
  });

  it('상태는 맞는데 승인 창 수가 모자라면 확인 필요다', () => {
    expect(judgeSiteRun(JUDGE, createObserved({ approvals: 0 }))).toBe(SITE_JUDGEMENT.review);
  });

  it('urlPattern 이 없으면 끝 URL 을 검사하지 않는다', () => {
    const judge: ISiteJudge = { statusList: ['done'], keywordList: [] };
    expect(judgeSiteRun(judge, createObserved({ endUrl: null }))).toBe(SITE_JUDGEMENT.success);
  });

  it('urlPattern 이 맞지 않으면 확인 필요다', () => {
    expect(judgeSiteRun(JUDGE, createObserved({ endUrl: 'https://example.com' }))).toBe(SITE_JUDGEMENT.review);
  });
});

describe('parseSiteResultLines', () => {
  it('JSONL 한 줄씩 결과로 읽고 빈 줄은 건너뛴다', () => {
    const text = `${JSON.stringify(createResult())}\n\n${JSON.stringify(createResult({ n: 2 }))}\n`;
    expect(parseSiteResultLines(text).map((result) => result.n)).toEqual([1, 2]);
  });

  it('형식이 틀린 줄이 있으면 throw 한다', () => {
    expect(() => parseSiteResultLines(JSON.stringify({ id: 'x' }))).toThrow();
  });
});

describe('summarizeSiteResults', () => {
  const resultList = [
    createResult({ n: 1 }),
    createResult({ n: 2, judgement: SITE_JUDGEMENT.review, toolCalls: 20, inputTokens: 3000, durationMs: null }),
    createResult({ n: 3, judgement: SITE_JUDGEMENT.fail, toolCalls: 30, inputTokens: 2000, durationMs: 4000 }),
    createResult({ id: 'wiki', n: 1, toolCalls: 4, inputTokens: 500, outputTokens: 50, durationMs: 1000 }),
  ];
  const summary = summarizeSiteResults(resultList);

  it('시나리오별로 성공·확인 필요·실패 수를 센다', () => {
    expect(summary.scenarioList[0]).toMatchObject({ id: 'korail', runs: 3, success: 1, review: 1, fail: 1 });
  });

  it('시나리오별 평균 도구 호출·토큰을 낸다', () => {
    expect(summary.scenarioList[0]).toMatchObject({ avgToolCalls: 20, avgInputTokens: 2000, avgOutputTokens: 100 });
  });

  it('평균 시간은 시간이 없는 회차를 빼고 낸다', () => {
    expect(summary.scenarioList[0]?.avgDurationMs).toBe(3000);
  });

  it('전체 성공률과 합계 토큰을 낸다', () => {
    expect(summary.total).toEqual({
      runs: 4,
      success: 2,
      review: 1,
      fail: 1,
      successRate: 0.5,
      inputTokens: 6500,
      outputTokens: 350,
    });
  });

  it('결과가 없으면 성공률 0 이다', () => {
    expect(summarizeSiteResults([]).total.successRate).toBe(0);
  });
});

describe('convertSiteToMarkdown', () => {
  it('시나리오별 줄과 전체 성공률 줄을 만든다', () => {
    const text = convertSiteToMarkdown(summarizeSiteResults([createResult(), createResult({ n: 2 })]));
    expect(text).toContain('| korail | 2/0/0 | 10.0 | 1000/100 | 2.0s |');
    expect(text).toContain('전체 성공률: 100.0% (2/2)');
  });
});
