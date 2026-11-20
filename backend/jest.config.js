/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Once before all tests: a fresh test database built from the migration files.
  globalSetup: '<rootDir>/tests/globalSetup.ts',
  // Before each test file: point the API at the test database and a temporary upload folder.
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
};
