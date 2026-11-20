// The same values as backend/migrations/002_seed_plants.sql, so the PIN check works offline from the
// first install. Only a salt and sha256(salt + PIN) are stored, never the PIN. When the phone is online,
// the app refreshes this list from GET /api/plants.
export const PLANTS_SEED = [
  {
    code: 'KOLHAPUR',
    name: 'Kolhapur',
    pinSalt: '5b7de9323f163f0a83af7dfae1423065',
    pinHash: '45ab1335a56b2df4f3f9c1c973748690eaa194e0244f957e1be8f62bb34edfa6',
  },
  {
    code: 'UP',
    name: 'UP',
    pinSalt: '721e52da8c63939f583ae4106052f46b',
    pinHash: 'fde82043bea39ebda565c01698783176d420917cb3ef39361991a5f7b5dff641',
  },
];
