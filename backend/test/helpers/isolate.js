// Jest setupFiles: cô lập SUT mà KHÔNG sửa production code.
// 1) sqlite3: mọi Database mở ':memory:' thay vì backend/database.sqlite
//    -> mỗi test file (mỗi Jest worker) có DB riêng, không làm bẩn file đang track.
// 2) express: bắt instance app do server.js tạo và thay app.listen bằng no-op
//    -> không chiếm port 3000, test gọi app trực tiếp qua supertest.
jest.mock('sqlite3', () => {
  const actual = jest.requireActual('sqlite3');
  class MemoryDatabase extends actual.Database {
    constructor(_filename, ...rest) {
      super(':memory:', ...rest);
    }
  }
  const mocked = { ...actual, Database: MemoryDatabase };
  mocked.verbose = () => mocked;
  return mocked;
});

jest.mock('express', () => {
  const actual = jest.requireActual('express');
  const wrapped = (...args) => {
    const app = actual(...args);
    app.listen = (_port, cb) => {
      if (cb) cb();
      return { close() {} };
    };
    global.__ESHOP_APP__ = app;
    return app;
  };
  Object.assign(wrapped, actual);
  return wrapped;
});
