-- version 1: run(작업 1건)과 step(도구 호출 1회) 기록
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  reason TEXT,
  usage_json TEXT,
  created_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE steps (
  run_id TEXT NOT NULL REFERENCES runs(id),
  n INTEGER NOT NULL,
  tool TEXT NOT NULL,
  input_json TEXT NOT NULL,
  result_text TEXT,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, n)
);
