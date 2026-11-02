-- entries(업무일지 기록)는 삭제되지 않고 영구 누적되는 유일한 데이터라
-- 행 단위 CRUD가 가능하도록 별도 테이블로 둔다(전체를 매번 통째로 주고받지 않게).
CREATE TABLE IF NOT EXISTS entries (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  start      TEXT NOT NULL,
  end        TEXT,
  category   TEXT,
  source     TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_start ON entries(start);

-- 나머지(todos/categories/categoryColors/dailyTemplates/dailyCompletions/
-- calendarEvents/projects/projectColors)는 기존에도 localStorage에 "키 하나당
-- JSON 배열/객체 하나"로 저장돼 있었고 완료 시 삭제되어 크기가 작게 유지되므로,
-- 굳이 관계형으로 쪼개지 않고 키-값 그대로 옮긴다(프런트 코드 변경을 최소화).
CREATE TABLE IF NOT EXISTS kv_store (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PIN 해시 및 브루트포스 잠금 상태.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 근무관리(근태): entries와 마찬가지로 날짜마다 영구 누적되는 데이터라 날짜별
-- 행 단위 테이블로 둔다. 하루치 상세(출퇴근/지각·조퇴·외출 구간/연차시간 등)는
-- 구조가 자주 바뀔 수 있어 JSON(detail)으로 묶고, date만 키로 둔다.
CREATE TABLE IF NOT EXISTS labor_records (
  date       TEXT PRIMARY KEY,
  detail     TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 연차 부여/조정 내역(수동 입력). "사용"은 labor_records의 leaveHours를 그대로
-- 합산해서 구하므로 따로 저장하지 않음(이중 기장으로 인한 불일치 방지).
CREATE TABLE IF NOT EXISTS leave_ledger (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  kind       TEXT NOT NULL, -- 'grant' | 'adjust'
  hours      REAL NOT NULL,
  memo       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_date ON leave_ledger(date);
