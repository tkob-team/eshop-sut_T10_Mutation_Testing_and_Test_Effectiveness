// S3-F01 — Jest config cho nhánh manual: baseline + manual assertions của Tấn Hiệp.
// Giữ nguyên cấu hình "jest" trong package.json, chỉ mở rộng testMatch.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/helpers/isolate.js'],
  testMatch: ['<rootDir>/test/**/*.test.js', '<rootDir>/test/manual/**/*.manual.js'],
};
