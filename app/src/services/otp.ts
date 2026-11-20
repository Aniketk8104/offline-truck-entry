import * as Crypto from 'expo-crypto';

// The largest multiple of 1,000,000 below 2^32. Random values at or above it are skipped,
// so every OTP from 000000 to 999999 is equally likely.
const LIMIT = 4_294_000_000;

// 6 digits from the phone's secure random generator; works offline (F5).
export function generateOtp(): string {
  for (;;) {
    const [value] = Crypto.getRandomValues(new Uint32Array(1));
    if (value < LIMIT) return String(value % 1_000_000).padStart(6, '0');
  }
}
