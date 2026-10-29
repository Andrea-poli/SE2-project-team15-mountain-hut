-- ★ Shared file (planning 4.2): tables of the data model, used by every story.
-- Applied by db.js to a new database: this is schema version 1 and stays as it is.
-- Later changes (new columns or tables) go in a migration step of db.js (MIGRATIONS).
--
-- Formats: dates 'YYYY-MM-DD' and times 'HH:MM' in hut local time, created_at ISO UTC.
-- Foreign keys are enforced by db.js (PRAGMA foreign_keys = ON on every connection).

-- Hikers, employees and the warden.
-- email and password_hash are nullable for the temporary hikers of MH-07 (name and
-- optional phone only, cannot log in): SQLite cannot drop a NOT NULL later.
-- Web registration and staff accounts still require them (checked in the code).
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT, -- salt + scrypt hash (U5); NULL = cannot log in
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  phone         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('hiker', 'employee', 'warden'))
);

-- Meal slots: one day, start and end time.
-- No overlap with another slot of the same day: checked in slotService (MH-02),
-- inside the transaction that creates the slot. Adjacent turns are allowed.
CREATE TABLE IF NOT EXISTS slots (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start_time TEXT NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  end_time   TEXT NOT NULL CHECK (end_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  label      TEXT, -- e.g. 'Lunch', 'Dinner – 1st turn'
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- 'HH:MM' strings compare like times thanks to the fixed format above.
  CHECK (end_time > start_time)
);

-- Tables of each slot (MH-02): every slot has its own set, they go with their slot.
CREATE TABLE IF NOT EXISTS slot_tables (
  id      INTEGER PRIMARY KEY,
  slot_id INTEGER NOT NULL REFERENCES slots (id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  seats   INTEGER NOT NULL CHECK (seats > 0),
  UNIQUE (slot_id, name)
);

-- Bookings (MH-01). A slot with bookings cannot be deleted (RESTRICT).
-- status has no CHECK on purpose: its values live in BOOKING_STATUS (bookingDao.js),
-- so MH-16 can add a waiting state without rebuilding the table.
CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY,
  slot_id    INTEGER NOT NULL REFERENCES slots (id) ON DELETE RESTRICT,
  hiker_id   INTEGER NOT NULL REFERENCES users (id), -- a temporary hiker for phone bookings (MH-07)
  party_size INTEGER NOT NULL CHECK (party_size > 0), -- the whole party, the hiker included
  status     TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL -- ISO UTC, from now() of clock.js (48 h rule of MH-06)
);

-- Where the party sits: seats taken at each table of the slot.
CREATE TABLE IF NOT EXISTS booking_tables (
  booking_id    INTEGER NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  slot_table_id INTEGER NOT NULL REFERENCES slot_tables (id) ON DELETE RESTRICT,
  seats         INTEGER NOT NULL CHECK (seats > 0),
  PRIMARY KEY (booking_id, slot_table_id)
);

-- Seats taken in a slot (availability, booking) and slots of a day or a week.
CREATE INDEX IF NOT EXISTS bookings_by_slot ON bookings (slot_id);
CREATE INDEX IF NOT EXISTS booking_tables_by_slot_table ON booking_tables (slot_table_id);
CREATE INDEX IF NOT EXISTS slots_by_date ON slots (date, start_time);
