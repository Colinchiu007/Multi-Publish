module.exports = {
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
    '^@multi-publish/shared-utils/src/(.*)$': '<rootDir>/../../packages/shared-utils/src/$1',
  },
}
