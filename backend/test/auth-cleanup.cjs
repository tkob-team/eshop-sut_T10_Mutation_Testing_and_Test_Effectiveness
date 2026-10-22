// Integration-only resource cleanup. Original Auth assertions remain unchanged.
afterAll(async () => {
  const db = require('../database');
  await new Promise((resolve,reject) => db.close(error => error ? reject(error) : resolve()));
});
