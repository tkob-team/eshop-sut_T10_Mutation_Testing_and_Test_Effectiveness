// Baseline Auth suite plus the S3-F03 manual assertions. Same isolation as jest.auth.config.cjs.
module.exports = {
  rootDir: __dirname,
  displayName: 'auth-manual',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/auth.spec.test.js', '<rootDir>/test/auth.manual.test.js'],
  setupFilesAfterEnv: ['<rootDir>/test/auth-cleanup.cjs'],
  modulePathIgnorePatterns: ['<rootDir>/stryker-tmp/'],
};
