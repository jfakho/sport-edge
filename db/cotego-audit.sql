-- Dedicated Preview database, no production/user/billing data.
CREATE TABLE IF NOT EXISTS predictions (
  match_id INTEGER PRIMARY KEY,
  competition TEXT NOT NULL,
  kickoff_utc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  home_id INTEGER NOT NULL,
  away_id INTEGER NOT NULL,
  home_name TEXT NOT NULL,
  away_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  model_version TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  CHECK (created_at < kickoff_utc),
  CHECK (home_id <> away_id)
);
CREATE INDEX IF NOT EXISTS predictions_competition_kickoff ON predictions(competition,kickoff_utc DESC);
CREATE TRIGGER IF NOT EXISTS predictions_immutable
BEFORE UPDATE ON predictions BEGIN SELECT RAISE(ABORT,'Recorded predictions are immutable'); END;
CREATE TABLE IF NOT EXISTS verified_results (
  match_id INTEGER PRIMARY KEY REFERENCES predictions(match_id),
  home_goals INTEGER NOT NULL CHECK(home_goals BETWEEN 0 AND 35),
  away_goals INTEGER NOT NULL CHECK(away_goals BETWEEN 0 AND 35),
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source='football-data.org')
);
CREATE TABLE IF NOT EXISTS odds_requests (
  request_id TEXT PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES predictions(match_id),
  reserved_credits INTEGER NOT NULL CHECK(reserved_credits BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'reserved'
);
CREATE INDEX IF NOT EXISTS odds_requests_created ON odds_requests(created_at);
CREATE TABLE IF NOT EXISTS odds_provider_budget (
  id INTEGER PRIMARY KEY CHECK(id=1),
  remaining INTEGER NOT NULL,
  cycle_started_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS odds_reservation_decrements_budget
AFTER INSERT ON odds_requests BEGIN
  UPDATE odds_provider_budget SET remaining=remaining-NEW.reserved_credits WHERE id=1;
END;
CREATE TABLE IF NOT EXISTS odds_snapshots (
  match_id INTEGER PRIMARY KEY REFERENCES predictions(match_id),
  received_at TEXT NOT NULL,
  quotes_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS football_feed_cache (
  competition TEXT PRIMARY KEY,
  payload_json TEXT,
  fetched_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS football_provider_requests (
  request_id TEXT PRIMARY KEY,
  requested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS football_provider_requested_at ON football_provider_requests(requested_at);
