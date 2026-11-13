import { describe, expect, it } from 'vitest';

import { HistoryListRequestSchema, HistoryListResponseSchema, HistoryRemoveRequestSchema } from '../history';

describe('HistoryListRequestSchema', () => {
  it('인자가 없으면 빈 검색어·기본 30개가 된다', () => {
    expect(HistoryListRequestSchema.parse(undefined)).toEqual({ query: '', limit: 30 });
  });

  it('검색어 앞뒤 공백을 지운다', () => {
    expect(HistoryListRequestSchema.parse({ query: '  사과 ' })).toEqual({ query: '사과', limit: 30 });
  });

  it('limit 이 0 이면 실패한다', () => {
    expect(HistoryListRequestSchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('limit 이 201 이면 실패한다', () => {
    expect(HistoryListRequestSchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});

describe('HistoryRemoveRequestSchema', () => {
  it('id 가 있으면 통과한다', () => {
    expect(HistoryRemoveRequestSchema.safeParse({ id: 'h1' }).success).toBe(true);
  });

  it('id 가 비면 실패한다', () => {
    expect(HistoryRemoveRequestSchema.safeParse({ id: '' }).success).toBe(false);
  });
});

describe('HistoryListResponseSchema', () => {
  it('기록 목록이면 통과한다', () => {
    const entry = { id: 'h1', url: 'https://a.com/', title: 'A', visitedAt: '2026-11-13T00:00:00.000Z' };
    expect(HistoryListResponseSchema.safeParse({ entryList: [entry] }).success).toBe(true);
  });
});
