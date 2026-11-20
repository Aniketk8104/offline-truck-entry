-- The two plants from the brief (PINs: Kolhapur 1234, UP 4567; see the README).
-- Only a random salt and sha256(salt + PIN) in hex are stored, never the PIN itself.
-- The app ships the same values, so the PIN check works offline from the first install,
-- and it refreshes them from GET /api/plants when it is online.
-- Check a PIN by hand:
--   SELECT pin_hash = encode(sha256(convert_to(pin_salt || '1234', 'UTF8')), 'hex') FROM plants WHERE code = 'KOLHAPUR';
INSERT INTO plants (code, name, pin_salt, pin_hash) VALUES
  ('KOLHAPUR', 'Kolhapur', '5b7de9323f163f0a83af7dfae1423065', '45ab1335a56b2df4f3f9c1c973748690eaa194e0244f957e1be8f62bb34edfa6'),
  ('UP',       'UP',       '721e52da8c63939f583ae4106052f46b', 'fde82043bea39ebda565c01698783176d420917cb3ef39361991a5f7b5dff641');
