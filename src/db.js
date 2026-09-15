// db.js — SQLite persistence layer for the Cloud-Based Network Alert Notification System
// Implements the Devices, Administrators, Alerts, and NotificationLogs tables
// described in Chapter Three (Section 3.6.2) of the project write-up.

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "cnans.db");
require("fs").mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  device_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  target            TEXT NOT NULL,          -- host:port for TCP checks, or full URL for HTTP checks
  check_method      TEXT NOT NULL DEFAULT 'tcp', -- 'tcp' | 'http'
  polling_interval  INTEGER NOT NULL DEFAULT 15, -- seconds
  fail_threshold    INTEGER NOT NULL DEFAULT 3,  -- consecutive failures before an alert is raised
  status            TEXT NOT NULL DEFAULT 'UNKNOWN', -- UP | DOWN | UNKNOWN
  consecutive_fails INTEGER NOT NULL DEFAULT 0,
  last_checked_at   TEXT,
  last_response_ms  INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  active            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS administrators (
  admin_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone_number TEXT,
  role         TEXT NOT NULL DEFAULT 'Administrator',
  notify_email INTEGER NOT NULL DEFAULT 1,
  notify_sms   INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id    INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  severity     TEXT NOT NULL DEFAULT 'CRITICAL',
  description  TEXT NOT NULL,
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);

CREATE TABLE IF NOT EXISTS notification_logs (
  log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id        INTEGER NOT NULL REFERENCES alerts(alert_id) ON DELETE CASCADE,
  admin_id        INTEGER REFERENCES administrators(admin_id) ON DELETE SET NULL,
  channel         TEXT NOT NULL,       -- EMAIL | SMS
  recipient       TEXT NOT NULL,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_status TEXT NOT NULL,       -- SENT | FAILED | SIMULATED
  detail          TEXT
);

CREATE TABLE IF NOT EXISTS check_history (
  check_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   INTEGER NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  checked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  success     INTEGER NOT NULL,
  response_ms INTEGER,
  detail      TEXT
);
`);

module.exports = db;
