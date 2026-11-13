-- version 3: 북마크·방문 기록 — spec 021. 북마크는 url 고유, 기록은 최근 순 조회 인덱스
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE history (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  visited_at TEXT NOT NULL
);

CREATE INDEX history_visited_at ON history (visited_at DESC);
