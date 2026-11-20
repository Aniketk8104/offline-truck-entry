-- Tables for plants and truck-entry submissions.
-- Postgres runs this file once, when it creates an empty data volume
-- (docker-compose.yml mounts this folder into /docker-entrypoint-initdb.d).
-- One transaction: if any statement fails, nothing is created.
BEGIN;

CREATE TABLE plants (
  code        TEXT PRIMARY KEY,                 -- 'KOLHAPUR', 'UP': the same value on the phone and the server
  name        TEXT NOT NULL,
  pin_salt    TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,                    -- sha256(salt + pin) as hex; the PIN itself is never stored
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ok: fresh GPS fix · last_known: older position, used when GPS timed out
-- unavailable: no position at all · denied: location permission refused
CREATE TYPE location_status AS ENUM ('ok', 'last_known', 'unavailable', 'denied');

CREATE TABLE submissions (
  id                  UUID PRIMARY KEY,         -- made on the phone; a retry sends the same id
  plant_code          TEXT NOT NULL REFERENCES plants (code),
  person_name         TEXT NOT NULL CHECK (length(trim(person_name)) BETWEEN 2 AND 100),
  truck_number        TEXT NOT NULL CHECK (truck_number ~ '^[A-Z0-9]+$'),  -- cleaned up by the app
  photo_path          TEXT NOT NULL,            -- file name in the uploads folder, e.g. <id>.jpg; the image is not in the DB
  photo_mime          TEXT NOT NULL,
  photo_bytes         INT  NOT NULL,
  latitude            NUMERIC(9,6) CHECK (latitude BETWEEN -90 AND 90),
  longitude           NUMERIC(9,6) CHECK (longitude BETWEEN -180 AND 180),
  location_accuracy_m REAL,
  location_status     location_status NOT NULL,
  location_mocked     BOOLEAN NOT NULL DEFAULT false,
  otp                 TEXT NOT NULL CHECK (otp ~ '^[0-9]{6}$'),
  captured_at         TIMESTAMPTZ NOT NULL,     -- when Submit was pressed (phone clock)
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when the server saved it
  device_id           TEXT,
  app_version         TEXT,
  -- A position must be there exactly when the status says there is one.
  CONSTRAINT location_matches_status CHECK (
    (location_status IN ('ok', 'last_known') AND latitude IS NOT NULL AND longitude IS NOT NULL)
    OR (location_status IN ('unavailable', 'denied') AND latitude IS NULL AND longitude IS NULL)
  )
);

-- Newest entries per plant (for the list endpoint), and lookup by truck number.
CREATE INDEX idx_submissions_plant_time ON submissions (plant_code, captured_at DESC);
CREATE INDEX idx_submissions_truck ON submissions (truck_number);

COMMIT;
