// S3-G01 — Jest config cho nhánh AI: baseline + AI Agent assertions đã review.
// Giữ nguyên cấu hình "jest" trong package.json, chỉ mở rộng testMatch.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/helpers/isolate.js'],
  testMatch: ['<rootDir>/test/**/*.test.js', '<rootDir>/test/ai/**/*.ai.js'],
};
