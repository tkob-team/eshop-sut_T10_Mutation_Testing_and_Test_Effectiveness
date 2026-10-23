// S3-D04 AI-proposed tests aimed at surviving / uncovered mutants of server.js lines 20-135.
// Expected results come from the spec; where only an HTTP convention applies, the test says so.
jest.mock('../database', () => require('./testDb'));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { testApi } = require('./testDb');
const { loadApp, freezeClock, advanceClock } = require('./harness');
const { ALICE, BOB, NEW_USER, STRONG_PASSWORD, login, loginOk, bearer } = require('./fixtures');

// The mocked ../database module is the in-memory sqlite handle itself.
const db = require('./testDb');
const run = (sql, params = []) =>
  new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));

// Force one kind of statement to fail, then always clean up.
async function withFailingTrigger(event, fn) {
  await run(`CREATE TRIGGER force_fail BEFORE ${event} ON users BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);
  try {
    return await fn();
  } finally {
    await run('DROP TRIGGER force_fail');
  }
}

// Make SELECTs on users fail ("no such table"), then always restore.
async function withUsersTableMissing(fn) {
  await run('ALTER TABLE users RENAME TO users_hidden');
  try {
    return await fn();
  } finally {
    await run('ALTER TABLE users_hidden RENAME TO users');
  }
}

const expectErrorMessage = (res) => {
  expect(typeof res.body.error).toBe('string');
  expect(res.body.error.length).toBeGreaterThan(0);
};

let app;
beforeAll(() => { app = loadApp(); });
beforeEach(async () => { await testApi.resetUsers([ALICE, BOB]); });
afterEach(() => { jest.useRealTimers(); });

describe('Registration failure (API 1.1; 500 and error shape are conventions)', () => {
  // kills mutant 8
  test('AI-R01 a failed insert is not reported as a successful registration', async () => {
    const res = await withFailingTrigger('INSERT', () => request(app).post('/api/register').send(NEW_USER));
    expect(res.status).toBe(500);
    expect(res.body.message).toBeUndefined();
    expect(await testApi.countByEmail(NEW_USER.email)).toBe(0);
  });

  // kills mutant 9
  test('AI-R02 a failed insert returns a non-empty error message', async () => {
    const res = await withFailingTrigger('INSERT', () => request(app).post('/api/register').send(NEW_USER));
    expectErrorMessage(res);
  });
});

describe('Login failure and lock (API 1.2, README FR-02)', () => {
  // kills mutant 21
  test('AI-L01 a database failure during login is a 500 (convention), not "invalid credentials"', async () => {
    const res = await withUsersTableMissing(() => login(app, ALICE.email, ALICE.password));
    expect(res.status).toBe(500);
    expect(res.body.token).toBeUndefined();
  });

  // kills mutant 22
  test('AI-L02 a database failure during login returns a non-empty error message', async () => {
    const res = await withUsersTableMissing(() => login(app, ALICE.email, ALICE.password));
    expectErrorMessage(res);
  });

  // kills mutant 32 (interpretation: a 30 s lock is over once its full duration has elapsed)
  test('AI-L03 at the exact instant the lock ends the account can log in; 1 ms earlier it cannot', async () => {
    freezeClock('2026-10-22T08:00:29.999Z');
    await run('UPDATE users SET locked_until = ? WHERE email = ?', ['2026-10-22T08:00:30.000Z', ALICE.email]);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(403);
    advanceClock(1);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });

  // kills mutants 35, 36 (FR-02: "thông báo lỗi phù hợp"; exact text not specified)
  test('AI-L04 a locked account gets a non-empty error message', async () => {
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    const res = await login(app, ALICE.email, ALICE.password);
    expect(res.status).toBe(403);
    expectErrorMessage(res);
  });
});

describe('Forgot password (API 1.3, README FR-03)', () => {
  const forgot = (email) => request(app).post('/api/forgot-password').send({ email });
  const tokenWithRandom = async (value) => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(value);
    try {
      return (await forgot(ALICE.email)).body.resetToken;
    } finally {
      spy.mockRestore();
    }
  };

  // kills mutants 74, 75 (FR-03: random, all-digit code; length is deliberately not asserted)
  test('AI-P01 the reset code is all digits and depends on the random source', async () => {
    const low = await tokenWithRandom(0);
    const high = await tokenWithRandom(0.999);
    expect(low).toMatch(/^\d+$/);
    expect(high).toMatch(/^\d+$/);
    expect(high).not.toBe(low);
  });

  // kills mutant 81 (500 is a convention)
  test('AI-P02 if the token cannot be stored, no reset token is handed out', async () => {
    const res = await withFailingTrigger('UPDATE', () => forgot(ALICE.email));
    expect(res.status).toBe(500);
    expect(res.body.resetToken).toBeUndefined();
  });

  // kills mutant 82
  test('AI-P03 if the token cannot be stored, a non-empty error message is returned', async () => {
    const res = await withFailingTrigger('UPDATE', () => forgot(ALICE.email));
    expectErrorMessage(res);
  });
});

describe('Profile update (API 2.2, README FR-04, SEC-06)', () => {
  const update = (token, body) => request(app).put('/api/users/me').set(bearer(token)).send(body);
  const PROFILE = { name: 'Alice Nguyen', shipping_address: '123 Le Loi, Q1, TP.HCM', phone: '0912345678' };

  // kills mutant 132
  test('AI-U01 updating the profile without a role leaves the role unchanged', async () => {
    const token = await loginOk(app, ALICE);
    expect((await update(token, PROFILE)).status).toBe(200);
    expect((await testApi.userByEmail(ALICE.email)).role).toBe('user');
  });

  // kills mutants 142, 143 (500 and error shape are conventions); token is obtained before the trigger exists
  test('AI-U02 a failed profile update is a 500 with a non-empty error message', async () => {
    const token = await loginOk(app, ALICE);
    const res = await withFailingTrigger('UPDATE', () => update(token, PROFILE));
    expect(res.status).toBe(500);
    expectErrorMessage(res);
    expect(res.body.message).toBeUndefined();
  });

  // Mutants 133-136 (role branch). Spec (FR-04, SEC-06): role cannot be changed by the client.
  // server.js currently lets it be changed, so this assertion FAILS on the original code; test.failing
  // makes the suite green today and turns red once server.js is fixed (then change it to a plain test).
  // It reports mutants 133-136 as killed only because each of them happens to remove the vulnerability.
  test.failing('AI-U03 KNOWN BUG: PUT /me with role "admin" must not change the role (SEC-06)', async () => {
    const token = await loginOk(app, ALICE);
    await update(token, { ...PROFILE, role: 'admin' });
    expect((await testApi.userByEmail(ALICE.email)).role).toBe('user');
  });
});
