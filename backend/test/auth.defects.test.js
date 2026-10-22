// S3-D03 Authentication & Users: spec-derived tests that FAIL on the original code. Each failure is a
// documented original defect (code deviates from README.md / api_specification.md), not a wrong expected
// value. Run with `npm run test:defects`. Not part of the baseline suite handed to S3-D04.
jest.mock('../database', () => require('./testDb'));
const request = require('supertest');
const { testApi } = require('./testDb');
const { loadApp, freezeClock, advanceClock } = require('./harness');
const { ALICE, BOB, NEW_USER, STRONG_PASSWORD, login, loginOk, bearer } = require('./fixtures');

let app;
beforeAll(() => { app = loadApp(); });
beforeEach(async () => { await testApi.resetUsers([ALICE, BOB]); });
afterEach(() => { jest.useRealTimers(); });

// "Refused" = a client error. The spec says "từ chối" without a code, so any 4xx is accepted.
const expectRefused = (res) => {
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect(res.status).toBeLessThan(500);
};

describe('D-LOCK: README FR-02 login counter and lock', () => {
  test('DF-01 each wrong login adds exactly 1 to the counter ("đúng 1 đơn vị")', async () => {
    await login(app, ALICE.email, 'Wrong123!');
    expect((await testApi.userByEmail(ALICE.email)).login_attempts).toBe(1);
  });

  test('DF-02 two wrong logins do not lock; the third does ("từ 3 lần trở lên")', async () => {
    await login(app, ALICE.email, 'Wrong123!');
    await login(app, ALICE.email, 'Wrong123!');
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });

  test('DF-03 the lock lasts 30 seconds: login succeeds 31 s after the third wrong attempt', async () => {
    freezeClock('2026-10-22T08:00:00.000Z');
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    advanceClock(31000);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });
});

describe('D-REG: README FR-01 registration validation and SEC-01', () => {
  const register = (body) => request(app).post('/api/register').send(body);

  test.each([['no @', 'user.test.local'], ['no domain', 'user@'], ['empty', '']])(
    'DF-04 invalid email is refused: %s',
    async (_label, email) => {
      expectRefused(await register({ ...NEW_USER, email }));
      expect(await testApi.countByEmail(email)).toBe(0);
    },
  );

  test('DF-05 a duplicate email is refused ("duy nhất")', async () => {
    expectRefused(await register({ ...NEW_USER, email: ALICE.email }));
    expect(await testApi.countByEmail(ALICE.email)).toBe(1);
  });

  test.each([
    ['7 characters', 'Abc12!x'], ['no upper case', 'abcdef1!'], ['no lower case', 'ABCDEF1!'],
    ['no digit', 'Abcdefg!'], ['no special character', 'Abcdefg1'],
  ])('DF-06 weak password is refused: %s', async (_label, password) => {
    expectRefused(await register({ ...NEW_USER, password }));
    expect(await testApi.countByEmail(NEW_USER.email)).toBe(0);
  });

  test('DF-07 the name is required', async () => {
    expectRefused(await register({ email: NEW_USER.email, password: NEW_USER.password }));
    expect(await testApi.countByEmail(NEW_USER.email)).toBe(0);
  });

  test('DF-08 the password is not stored as plaintext (SEC-01)', async () => {
    await request(app).post('/api/register').send(NEW_USER);
    expect((await testApi.userByEmail(NEW_USER.email)).password).not.toBe(NEW_USER.password);
  });
});

describe('D-OTP: README FR-03 and SEC-07', () => {
  const forgot = (email) => request(app).post('/api/forgot-password').send({ email });
  const reset = (email, resetToken, newPassword) =>
    request(app).post('/api/reset-password').send({ email, resetToken, newPassword });

  test('DF-09 the OTP has 6 digits ("6 chữ số", SEC-07 "tối thiểu 6 chữ số")', async () => {
    expect((await forgot(ALICE.email)).body.resetToken).toMatch(/^\d{6}$/);
  });

  test('DF-10 the OTP expires: a token older than 24 hours is refused (SEC-07 "có thời hạn"; 24 h is the test\'s assumed bound, the spec gives none)', async () => {
    freezeClock('2026-10-22T08:00:00.000Z');
    const { resetToken } = (await forgot(ALICE.email)).body;
    advanceClock(24 * 60 * 60 * 1000 + 1000);
    expectRefused(await reset(ALICE.email, resetToken, STRONG_PASSWORD));
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });

  test('DF-11 the new password must satisfy the FR-01 strength rule', async () => {
    const { resetToken } = (await forgot(ALICE.email)).body;
    expectRefused(await reset(ALICE.email, resetToken, 'weak'));
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });
});

describe('D-PROFILE: README FR-04, SEC-06 and API 2.2', () => {
  const me = (token) => request(app).get('/api/users/me').set(bearer(token));
  const update = (token, body) => request(app).put('/api/users/me').set(bearer(token)).send(body);
  const PROFILE = { name: 'Alice Nguyen', shipping_address: '123 Le Loi, Q1, TP.HCM', phone: '0912345678' };

  test('DF-12 PUT /me cannot change the role (SEC-06, FR-04)', async () => {
    const token = await loginOk(app, ALICE);
    await update(token, { ...PROFILE, role: 'admin' });
    expect((await me(token)).body.role).toBe('user');
  });

  test.each([
    ['9 digits', '091234567'], ['12 digits', '091234567890'], ['not starting with 0', '9123456789'],
    ['letters', '09123abcde'], ['empty', ''],
  ])('DF-13 invalid phone is refused (FR-04): %s', async (_label, phone) => {
    const token = await loginOk(app, ALICE);
    expectRefused(await update(token, { ...PROFILE, phone }));
    expect((await me(token)).body.phone).toBeNull();
  });
});
