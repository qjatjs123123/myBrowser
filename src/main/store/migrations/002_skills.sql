-- version 2: 스킬(사용자 지침) — spec 013. name_key = lower(trim(name)) 로 이름 중복을 막는다 (FR-7)
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
