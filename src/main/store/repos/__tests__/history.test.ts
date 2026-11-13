import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase } from '../../db';
import { createHistoryRepo } from '../history';

let db: DatabaseSync;
let clock = 0;
let idCount = 0;

/** 호출마다 1초씩 늘어나는 시각 */
function now(): Date {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 13, 0, 0, clock));
}

function createRepo(rowMax?: number) {
  return createHistoryRepo(db, { now, createId: () => `h${String(++idCount)}`, rowMax });
}

const ALL = { query: '', limit: 30 };

beforeEach(() => {
  clock = 0;
  idCount = 0;
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('createHistoryRepo 기록', () => {
  it('기록하면 최근 순으로 보인다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: 'A' });
    repo.record({ url: 'https://b.com/', title: 'B' });
    expect(repo.list(ALL).map((entry) => entry.title)).toEqual(['B', 'A']);
  });

  it('가장 최근과 같은 url 이면 새 줄 대신 시각·제목을 갱신한다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: 'A' });
    repo.record({ url: 'https://a.com/', title: 'A 갱신' });
    expect(repo.list(ALL)).toMatchObject([{ id: 'h1', title: 'A 갱신', visitedAt: '2026-11-13T00:00:02.000Z' }]);
  });

  it('사이에 다른 페이지가 있으면 같은 url 도 새 줄이다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: 'A' });
    repo.record({ url: 'https://b.com/', title: 'B' });
    repo.record({ url: 'https://a.com/', title: 'A' });
    expect(repo.list(ALL)).toHaveLength(3);
  });

  it('빈 제목이면 url 을 제목으로 저장한다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: '' });
    expect(repo.list(ALL)[0]?.title).toBe('https://a.com/');
  });

  it('상한을 넘으면 오래된 줄부터 지운다', () => {
    const repo = createRepo(2);
    repo.record({ url: 'https://a.com/', title: 'A' });
    repo.record({ url: 'https://b.com/', title: 'B' });
    repo.record({ url: 'https://c.com/', title: 'C' });
    expect(repo.list(ALL).map((entry) => entry.title)).toEqual(['C', 'B']);
  });
});

describe('createHistoryRepo 조회', () => {
  it('검색어는 제목·url 부분 일치이고 대소문자를 무시한다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://shop.com/', title: 'Apple 가게' });
    repo.record({ url: 'https://news.com/apple', title: '뉴스' });
    repo.record({ url: 'https://other.com/', title: '다른 곳' });
    expect(repo.list({ query: 'APPLE', limit: 30 }).map((entry) => entry.title)).toEqual(['뉴스', 'Apple 가게']);
  });

  it('검색어의 % 는 글자 그대로 찾는다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: '100% 할인' });
    repo.record({ url: 'https://b.com/', title: '100원' });
    expect(repo.list({ query: '100%', limit: 30 }).map((entry) => entry.title)).toEqual(['100% 할인']);
  });

  it('limit 만큼만 돌려준다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: 'A' });
    repo.record({ url: 'https://b.com/', title: 'B' });
    expect(repo.list({ query: '', limit: 1 })).toHaveLength(1);
  });
});

describe('createHistoryRepo 지우기', () => {
  it('id 로 지우면 true 이고 목록에서 빠진다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: 'A' });
    expect(repo.remove('h1')).toBe(true);
    expect(repo.list(ALL)).toEqual([]);
  });

  it('없는 id 면 false 다', () => {
    expect(createRepo().remove('h9')).toBe(false);
  });

  it('clear 하면 모두 지운다', () => {
    const repo = createRepo();
    repo.record({ url: 'https://a.com/', title: 'A' });
    repo.record({ url: 'https://b.com/', title: 'B' });
    repo.clear();
    expect(repo.list(ALL)).toEqual([]);
  });
});
