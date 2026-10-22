// Original Phuc Hoang handoff has its own database mock/listen spy.
// Do not install the Cart/Coupons global mocks into this Jest project.
module.exports = {
  rootDir: __dirname,
  displayName: 'auth',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/auth.spec.test.js'],
  setupFilesAfterEnv: ['<rootDir>/test/auth-cleanup.cjs'],
  modulePathIgnorePatterns: ['<rootDir>/stryker-tmp/'],
};
