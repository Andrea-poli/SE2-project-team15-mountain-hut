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
-- phone is nullable too: staff do not need one; web registration requires it (U5, U8).
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY,
  email             TEXT UNIQUE COLLATE NOCASE,
  password_hash     TEXT, -- salt + scrypt hash (U5); NULL = cannot log in
  first_name        TEXT NOT NULL,
  last_name         TEXT,
  phone             TEXT,
  notes             TEXT, -- optional, e.g. 'registered mountain guide' (context.md, Hiker Information)
  emergency_contact TEXT, -- optional (context.md, Hiker Information)
  role              TEXT NOT NULL CHECK (role IN ('hiker', 'employee', 'warden'))
);

-- Meal slots: one day, start and end time.
-- No overlap with another slot of the same day: checked in slotService (MH-02),
-- inside the transaction that creates the slot. Adjacent turns are allowed.
CREATE TABLE IF NOT EXISTS slots (
  id         INTEGER PRIMARY KEY,
  -- Real calendar dates and times only: date() and strftime() normalise the value
  -- (2026-02-30 → 2026-03-02, 29:99 → NULL), so an impossible value is not equal to itself.
  -- IS, not =: a CHECK that gives NULL counts as passed. strftime accepts 24:30, hence < '24:00'.
  date       TEXT NOT NULL CHECK (date(date) IS date),
  start_time TEXT NOT NULL CHECK (strftime('%H:%M', start_time) IS start_time AND start_time < '24:00'),
  end_time   TEXT NOT NULL CHECK (strftime('%H:%M', end_time) IS end_time AND end_time < '24:00'),
  label      TEXT NOT NULL CHECK (trim(label) <> ''), -- e.g. 'Lunch', 'Dinner – 1st turn'
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

-- One confirmed booking per hiker in each slot (MH-01: to add people they change it, MH-06),
-- also against a double click. Cancelled ones do not count, so the hiker can book the slot again.
-- 'confirmed' = BOOKING_STATUS.CONFIRMED in bookingDao.js. The MH-01 service checks first, for a clear message.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_hiker_slot ON bookings (slot_id, hiker_id) WHERE status = 'confirmed';
