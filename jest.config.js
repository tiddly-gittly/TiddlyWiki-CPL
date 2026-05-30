/**
 * Jest Configuration
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/repo-cache/'
  ],
  transform: {
    '^.+\\.ts$': '<rootDir>/tests/ts-transformer.js'
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
