// S3-F03 Authentication & Users: manual assertions added after the E03 baseline run (SUT 806ba19).
// Each test targets surviving or uncovered mutants of the baseline Auth run and PASSES on the original code.
// Expected results come from api_specification.md §1-2 ("API") and README.md FR-02..FR-04, SEC-06 ("README").
// Tests marked "convention" rely on an HTTP/JSON convention because the spec gives no exact status or body.
// Run together with the baseline suite (test/auth.spec.test.js); the baseline file is not modified.
jest.mock('../database', () => require('./testDb'));
const request = require('supertest');
const db = require('./testDb');
const { testApi } = db;
const { loadApp, freezeClock } = require('./harness');
const { ALICE, BOB, login, loginOk, bearer } = require('./fixtures');

let app;
beforeAll(() => { app = loadApp(); });
beforeEach(async () => { await testApi.resetUsers([ALICE, BOB]); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const nonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const forgot = (email) => request(app).post('/api/forgot-password').send({ email });
const reset = (email, resetToken, newPassword) =>
  request(app).post('/api/reset-password').send({ email, resetToken, newPassword });
const me = (token) => request(app).get('/api/users/me').set(bearer(token));
const update = (token, body) => request(app).put('/api/users/me').set(bearer(token)).send(body);
const PROFILE = { name: 'Alice Nguyen', shipping_address: '123 Le Loi, Q1, TP.HCM', phone: '0912345678' };

// Make the next call of db[method] fail through its callback, as a broken database would.
const failNext = (method) =>
  jest.spyOn(db, method).mockImplementationOnce((...args) => {
    const callback = args[args.length - 1];
    callback.call({}, new Error('simulated database failure'));
  });

describe('Profile keeps the role (API 2.2, README FR-04, SEC-06)', () => {
  test('AM-01 a profile update without `role` leaves the stored role unchanged', async () => {
    const token = await loginOk(app, ALICE);
    expect((await update(token, PROFILE)).status).toBe(200);
    expect((await testApi.userByEmail(ALICE.email)).role).toBe('user');
    expect((await me(token)).body.role).toBe('user');
  });
});

describe('Reset code is a random number (README FR-03 "ngẫu nhiên", SEC-07)', () => {
  test('AM-02 the reset code is made of digits only, with no sign (random source fixed at 0.5)', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const { resetToken } = (await forgot(ALICE.email)).body;
    expect(resetToken).toMatch(/^\d+$/);
  });

  test('AM-03 the reset code depends on the random source: 0.1 and 0.9 give different codes', async () => {
    const random = jest.spyOn(Math, 'random');
    random.mockReturnValue(0.1);
    const low = (await forgot(ALICE.email)).body.resetToken;
    random.mockReturnValue(0.9);
    const high = (await forgot(ALICE.email)).body.resetToken;
    expect(low).not.toBe(high);
  });
});

describe('Error responses carry a message (README FR-02 "thông báo lỗi phù hợp"; others: convention)', () => {
  test('AM-04 the locked-account response has a non-empty error message (FR-02)', async () => {
    freezeClock('2026-10-23T08:00:00.000Z');
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    const res = await login(app, ALICE.email, ALICE.password);
    expect(res.status).toBe(403);
    expect(nonEmptyString(res.body.error)).toBe(true);
  });

  test('AM-05 forgot-password for an unknown email has status 404 and a non-empty error (convention)', async () => {
    const res = await forgot('nobody@test.local');
    expect(res.status).toBe(404);
    expect(nonEmptyString(res.body.error)).toBe(true);
  });

  test('AM-06 reset with a wrong token has status 400 and a non-empty error (convention)', async () => {
    await forgot(ALICE.email);
    const res = await reset(ALICE.email, 'not-the-token', 'NewPassw0rd!');
    expect(res.status).toBe(400);
    expect(nonEmptyString(res.body.error)).toBe(true);
  });

  test('AM-07 a successful reset returns a non-empty message like the other auth endpoints (convention)', async () => {
    const { resetToken } = (await forgot(ALICE.email)).body;
    const res = await reset(ALICE.email, resetToken, 'NewPassw0rd!');
    expect(res.status).toBe(200);
    expect(nonEmptyString(res.body.message)).toBe(true);
  });

  test('AM-08 GET /me without a token has status 401 and a non-empty error (SEC-02, convention)', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
    expect(nonEmptyString(res.body.error)).toBe(true);
  });

  test('AM-09 GET /me with an invalid token has a non-empty error (SEC-02, convention)', async () => {
    const res = await me('not.a.jwt');
    expect([401, 403]).toContain(res.status);
    expect(nonEmptyString(res.body.error)).toBe(true);
  });
});

describe('A database failure is not reported as success (spec silent; convention: HTTP 500 with an error)', () => {
  test('AM-10 POST /register: a failed insert returns 500 with an error and no success message', async () => {
    failNext('run');
    const res = await request(app).post('/api/register')
      .send({ name: 'Dave', email: 'dave@test.local', password: 'Dave1234!x' });
    expect(res.status).toBe(500);
    expect(nonEmptyString(res.body.error)).toBe(true);
    expect(res.body.message).toBeUndefined();
  });

  test('AM-11 POST /login: a failed lookup returns 500 with an error and no token', async () => {
    failNext('get');
    const res = await login(app, ALICE.email, ALICE.password);
    expect(res.status).toBe(500);
    expect(nonEmptyString(res.body.error)).toBe(true);
    expect(res.body.token).toBeUndefined();
  });

  test('AM-12 POST /forgot-password: a failed token save returns 500 with an error and no token', async () => {
    failNext('run');
    const res = await forgot(ALICE.email);
    expect(res.status).toBe(500);
    expect(nonEmptyString(res.body.error)).toBe(true);
    expect(res.body.resetToken).toBeUndefined();
  });

  test('AM-13 PUT /users/me: a failed update returns 500 with an error and no success message', async () => {
    const token = await loginOk(app, ALICE);
    failNext('run');
    const res = await update(token, PROFILE);
    expect(res.status).toBe(500);
    expect(nonEmptyString(res.body.error)).toBe(true);
    expect(res.body.message).toBeUndefined();
  });
});
