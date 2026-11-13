import { describe, expect, it } from 'vitest';

import { BookmarkAddRequestSchema, BookmarkListResponseSchema, BookmarkRemoveRequestSchema } from '../bookmarks';

describe('BookmarkAddRequestSchema', () => {
  it('https url 과 제목이면 통과한다', () => {
    expect(BookmarkAddRequestSchema.safeParse({ url: 'https://a.com/', title: 'A' }).success).toBe(true);
  });

  it('빈 제목이어도 통과한다', () => {
    expect(BookmarkAddRequestSchema.safeParse({ url: 'https://a.com/', title: '  ' }).success).toBe(true);
  });

  it('file: url 이면 실패한다', () => {
    expect(BookmarkAddRequestSchema.safeParse({ url: 'file:///etc/passwd', title: 'x' }).success).toBe(false);
  });

  it('제목이 301자면 실패한다', () => {
    expect(BookmarkAddRequestSchema.safeParse({ url: 'https://a.com/', title: 'a'.repeat(301) }).success).toBe(false);
  });
});

describe('BookmarkRemoveRequestSchema', () => {
  it('url 이 있으면 통과한다', () => {
    expect(BookmarkRemoveRequestSchema.safeParse({ url: 'https://a.com/' }).success).toBe(true);
  });

  it('url 이 비면 실패한다', () => {
    expect(BookmarkRemoveRequestSchema.safeParse({ url: '' }).success).toBe(false);
  });
});

describe('BookmarkListResponseSchema', () => {
  it('북마크 목록이면 통과한다', () => {
    const bookmark = { id: 'b1', url: 'https://a.com/', title: 'A', createdAt: '2026-11-13T00:00:00.000Z' };
    expect(BookmarkListResponseSchema.safeParse({ bookmarkList: [bookmark] }).success).toBe(true);
  });

  it('추가 키가 있으면 실패한다', () => {
    expect(BookmarkListResponseSchema.safeParse({ bookmarkList: [], extra: 1 }).success).toBe(false);
  });
});
