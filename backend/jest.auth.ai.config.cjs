// Baseline Auth suite plus the S3-G03 Claude-proposed assertions. Same isolation as jest.auth.config.cjs.
module.exports = {
  rootDir: __dirname,
  displayName: 'auth-ai',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/auth.spec.test.js', '<rootDir>/test/auth.ai.test.js'],
  setupFilesAfterEnv: ['<rootDir>/test/auth-cleanup.cjs'],
  modulePathIgnorePatterns: ['<rootDir>/stryker-tmp/'],
};
