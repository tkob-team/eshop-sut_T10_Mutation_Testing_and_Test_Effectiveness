// Test-only replacement for ./database: a real in-memory SQLite with the same `users` schema,
// so server.js runs its real SQL. Production database.js and server.js are not modified.
const sqlite3 = require('sqlite3');

const db = new sqlite3.Database(':memory:');

const ready = new Promise((resolve, reject) => {
  db.run(
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      password TEXT,
      role TEXT DEFAULT 'user',
      login_attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      reset_token TEXT,
      shipping_address TEXT,
      phone TEXT
    )`,
    (err) => (err ? reject(err) : resolve()),
  );
});

const exec = (sql, params = []) =>
  new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));
const first = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

// Seed users (same shape as database.js seed rows); ids are restarted so tests can rely on them.
async function resetUsers(users) {
  await ready;
  await exec('DELETE FROM users');
  await exec("DELETE FROM sqlite_sequence WHERE name = 'users'");
  for (const u of users) {
    await exec('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      u.name, u.email, u.password, u.role || 'user',
    ]);
  }
}

const userByEmail = (email) => first('SELECT * FROM users WHERE email = ?', [email]);
const countByEmail = async (email) => (await first('SELECT COUNT(*) AS n FROM users WHERE email = ?', [email])).n;

module.exports = db;
module.exports.testApi = { resetUsers, userByEmail, countByEmail };
