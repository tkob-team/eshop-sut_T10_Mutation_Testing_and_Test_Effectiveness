// Defects must never inherit baseline projects, otherwise Jest runs those instead.
module.exports = { projects: [
  {
    rootDir: __dirname,
    displayName: 'cart-coupons-defects',
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/test/helpers/isolate.js'],
    testMatch: ['<rootDir>/test/defects/*.defects.js'],
    modulePathIgnorePatterns: ['<rootDir>/stryker-tmp/'],
  },
  '<rootDir>/jest.auth-defects.config.cjs',
] };

