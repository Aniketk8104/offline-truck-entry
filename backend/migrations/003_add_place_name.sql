-- Place name for the position ("Rajarampuri, Kolhapur, Maharashtra"), looked up from OpenStreetMap
-- when the phone is online. Optional: the coordinates stay the real record.
-- A new database runs this file after 001 and 002. An existing one needs it applied by hand, because
-- Postgres runs this folder only when it creates an empty volume; IF NOT EXISTS makes a rerun harmless.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS place_name TEXT CHECK (char_length(place_name) <= 300);
