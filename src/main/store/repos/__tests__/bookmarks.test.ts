import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BOOKMARK_MESSAGE } from '@shared/ipc/bookmarks';

import { openDatabase } from '../../db';
import { createBookmarkRepo } from '../bookmarks';

let db: DatabaseSync;
let clock = 0;
let idCount = 0;

/** 호출마다 1초씩 늘어나는 시각 — 추가 순서를 시각으로 구분한다 */
function now(): Date {
  clock += 1;
  return new Date(Date.UTC(2026, 10, 13, 0, 0, clock));
}

function createRepo(countMax?: number) {
  return createBookmarkRepo(db, { now, createId: () => `b${String(++idCount)}`, countMax });
}

beforeEach(() => {
  clock = 0;
  idCount = 0;
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('createBookmarkRepo', () => {
  it('추가하면 목록에 생긴다', () => {
    const result = createRepo().add({ url: 'https://a.com/', title: 'A' });
    expect(result).toMatchObject({ ok: true, bookmarkList: [{ url: 'https://a.com/', title: 'A' }] });
  });

  it('목록은 최신 추가 순이다', () => {
    const repo = createRepo();
    repo.add({ url: 'https://a.com/', title: 'A' });
    repo.add({ url: 'https://b.com/', title: 'B' });
    expect(repo.list().map((bookmark) => bookmark.title)).toEqual(['B', 'A']);
  });

  it('같은 url 을 다시 추가하면 줄은 하나이고 제목만 바뀐다', () => {
    const repo = createRepo();
    repo.add({ url: 'https://a.com/', title: 'A' });
    repo.add({ url: 'https://a.com/', title: 'A 새 제목' });
    expect(repo.list()).toMatchObject([{ url: 'https://a.com/', title: 'A 새 제목' }]);
  });

  it('빈 제목이면 url 을 제목으로 저장한다', () => {
    const repo = createRepo();
    repo.add({ url: 'https://a.com/', title: '' });
    expect(repo.list()[0]?.title).toBe('https://a.com/');
  });

  it('상한에 이르면 새 url 은 LIMIT 이다', () => {
    const repo = createRepo(1);
    repo.add({ url: 'https://a.com/', title: 'A' });
    expect(repo.add({ url: 'https://b.com/', title: 'B' })).toEqual({
      ok: false,
      code: 'LIMIT',
      message: BOOKMARK_MESSAGE.tooMany,
    });
  });

  it('상한이어도 이미 있는 url 의 제목은 바꿀 수 있다', () => {
    const repo = createRepo(1);
    repo.add({ url: 'https://a.com/', title: 'A' });
    expect(repo.add({ url: 'https://a.com/', title: 'A2' }).ok).toBe(true);
  });

  it('지우면 목록에서 빠진다', () => {
    const repo = createRepo();
    repo.add({ url: 'https://a.com/', title: 'A' });
    expect(repo.remove('https://a.com/')).toEqual([]);
  });

  it('없는 url 을 지워도 목록을 돌려준다', () => {
    const repo = createRepo();
    repo.add({ url: 'https://a.com/', title: 'A' });
    expect(repo.remove('https://none.com/')).toHaveLength(1);
  });
});
