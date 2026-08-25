-- FXNavigator D1 schema
CREATE TABLE IF NOT EXISTS symbols (
  name        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT '',
  exchange    TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT '',
  is_active   INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);

CREATE TABLE IF NOT EXISTS candles (
  symbol   TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TEXT NOT NULL,
  open     REAL NOT NULL,
  high     REAL NOT NULL,
  low      REAL NOT NULL,
  close    REAL NOT NULL,
  volume   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, interval, open_time)
);

CREATE TABLE IF NOT EXISTS user_prefs (
  user_key   TEXT NOT NULL,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_key)
);
