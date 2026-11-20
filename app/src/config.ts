import appJson from '../app.json';

// Set at build time: EAS environment variables for the APK, or app/.env when running locally.
// EXPO_PUBLIC_ values are built into the app, so anyone with the APK can read them; they are
// not secrets (the README explains what the API key does and doesn't protect).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? '';

export const APP_VERSION: string = appJson.expo.version;
