// S3-D03 Authentication & Users: tests whose expected results come from the spec and that PASS on the
// Spec sources: api_specification.md §1-2 ("API"), README.md FR-01..FR-04 and SEC-01..SEC-07 ("README").
// Where the spec gives no status code, the test uses the HTTP convention and says so ("convention").
jest.mock('../database', () => require('./testDb'));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { testApi } = require('./testDb');
const { loadApp, freezeClock, advanceClock } = require('./harness');
const { ALICE, BOB, NEW_USER, STRONG_PASSWORD, login, loginOk, bearer } = require('./fixtures');

let app;
beforeAll(() => { app = loadApp(); });
beforeEach(async () => { await testApi.resetUsers([ALICE, BOB]); });
afterEach(() => { jest.useRealTimers(); });

describe('Registration (API 1.1)', () => {
  test('AU-R01 valid registration returns 200, the success message and a numeric id', async () => {
    const res = await request(app).post('/api/register').send(NEW_USER);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User registered successfully');
    expect(typeof res.body.id).toBe('number');
    expect(res.body.id).toBe(3);
  });

  test('AU-R02 a registered user can log in with the same credentials (API 1.2)', async () => {
    await request(app).post('/api/register').send(NEW_USER);
    const res = await login(app, NEW_USER.email, NEW_USER.password);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(NEW_USER.email);
  });
});

describe('Login and lock (API 1.2, README FR-02)', () => {
  test('AU-L01 correct credentials return 200, a JWT and the user', async () => {
    const res = await login(app, ALICE.email, ALICE.password);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(ALICE.email);
    expect(res.body.user.id).toBe(1);
  });

  test('AU-L02 the JWT carries the user id and role (FR-02, SEC-03)', async () => {
    const { token } = (await login(app, ALICE.email, ALICE.password)).body;
    const claims = jwt.decode(token);
    expect(claims.id).toBe(1);
    expect(claims.role).toBe('user');
  });

  test('AU-L03 wrong password is refused with 401 (convention) and no token', async () => {
    const res = await login(app, ALICE.email, 'Wrong123!');
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('AU-L04 unknown email gets the same status and body as a wrong password (FR-02: no cause leaked)', async () => {
    const wrongPassword = await login(app, ALICE.email, 'Wrong123!');
    const unknownEmail = await login(app, 'nobody@test.local', 'Wrong123!');
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test('AU-L05 three consecutive wrong passwords lock the account: the correct password is then refused (FR-02)', async () => {
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    const res = await login(app, ALICE.email, ALICE.password);
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  test('AU-L06 the lock still holds 29 seconds after the third wrong attempt (FR-02: 30 s)', async () => {
    freezeClock('2026-10-22T08:00:00.000Z');
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    advanceClock(29000);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(403);
  });

  test('AU-L07 a lock whose time has passed no longer blocks login', async () => {
    freezeClock('2026-10-22T08:00:00.000Z');
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    advanceClock(24 * 60 * 60 * 1000);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });

  test('AU-L08 a successful login resets the failure counter: wrong, ok, wrong, ok never locks (FR-02 "consecutive")', async () => {
    await login(app, ALICE.email, 'Wrong123!');
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
    await login(app, ALICE.email, 'Wrong123!');
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });

  test('AU-L09 failures of one account do not lock another account', async () => {
    for (let i = 0; i < 3; i += 1) await login(app, ALICE.email, 'Wrong123!');
    expect((await login(app, BOB.email, BOB.password)).status).toBe(200);
  });
});

describe('Forgot / reset password (API 1.3-1.4, README FR-03, SEC-07)', () => {
  const forgot = (email) => request(app).post('/api/forgot-password').send({ email });
  const reset = (email, resetToken, newPassword) =>
    request(app).post('/api/reset-password').send({ email, resetToken, newPassword });

  test('AU-P01 forgot-password for a registered email returns 200, the message and a reset token (API 1.3)', async () => {
    const res = await forgot(ALICE.email);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Mã đặt lại mật khẩu đã được tạo');
    expect(typeof res.body.resetToken).toBe('string');
    expect(res.body.resetToken.length).toBeGreaterThan(0);
  });

  test('AU-P02 forgot-password for an unknown email gives no token', async () => {
    const res = await forgot('nobody@test.local');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.resetToken).toBeUndefined();
  });

  test('AU-P03 reset with the issued token changes the password: new works, old no longer works (API 1.4)', async () => {
    const { resetToken } = (await forgot(ALICE.email)).body;
    const res = await reset(ALICE.email, resetToken, STRONG_PASSWORD);
    expect(res.status).toBe(200);
    expect((await login(app, ALICE.email, STRONG_PASSWORD)).status).toBe(200);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(401);
  });

  test('AU-P04 reset with a wrong token is refused with 400 (convention) and the password is unchanged', async () => {
    const { resetToken } = (await forgot(ALICE.email)).body;
    const wrong = resetToken === '000000' ? '111111' : '000000';
    const res = await reset(ALICE.email, wrong, STRONG_PASSWORD);
    expect(res.status).toBe(400);
    expect((await login(app, ALICE.email, ALICE.password)).status).toBe(200);
  });

  test("AU-P05 a token issued to one email cannot reset another account (FR-03)", async () => {
    const { resetToken } = (await forgot(ALICE.email)).body;
    const res = await reset(BOB.email, resetToken, STRONG_PASSWORD);
    expect(res.status).toBe(400);
    expect((await login(app, BOB.email, BOB.password)).status).toBe(200);
  });

  test('AU-P06 a token is invalidated after use (SEC-07): the second reset with it is refused', async () => {
    const { resetToken } = (await forgot(ALICE.email)).body;
    await reset(ALICE.email, resetToken, STRONG_PASSWORD);
    const again = await reset(ALICE.email, resetToken, 'Another1Pass!');
    expect(again.status).toBe(400);
    expect((await login(app, ALICE.email, STRONG_PASSWORD)).status).toBe(200);
  });
});

describe('Profile (API 2.1-2.2, README FR-04, SEC-02)', () => {
  const me = (token) => request(app).get('/api/users/me').set(bearer(token));
  const update = (token, body) => request(app).put('/api/users/me').set(bearer(token)).send(body);
  const PROFILE = { name: 'Alice Nguyen', shipping_address: '123 Le Loi, Q1, TP.HCM', phone: '0912345678' };

  test('AU-U01 GET /me without a token is refused with 401 (SEC-02)', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401);
  });

  test('AU-U02 GET /me with an invalid token is refused (SEC-02)', async () => {
    const res = await me('not.a.jwt');
    expect([401, 403]).toContain(res.status);
  });

  test('AU-U03 GET /me returns the profile of the token owner only (API 2.1)', async () => {
    const res = await me(await loginOk(app, BOB));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(BOB.email);
    expect(res.body.name).toBe(BOB.name);
  });

  test('AU-U04 PUT /me updates name, shipping address and phone, and GET /me reflects them (API 2.2)', async () => {
    const token = await loginOk(app, ALICE);
    const res = await update(token, PROFILE);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile updated');
    const after = (await me(token)).body;
    expect(after.name).toBe(PROFILE.name);
    expect(after.shipping_address).toBe(PROFILE.shipping_address);
    expect(after.phone).toBe(PROFILE.phone);
  });

  test("AU-U05 updating one user's profile leaves other users unchanged (FR-04: own profile only)", async () => {
    await update(await loginOk(app, ALICE), PROFILE);
    const bob = await testApi.userByEmail(BOB.email);
    expect(bob.name).toBe(BOB.name);
    expect(bob.phone).toBeNull();
  });

  test('AU-U06 the email cannot be changed through PUT /me (FR-04)', async () => {
    const token = await loginOk(app, ALICE);
    await update(token, { ...PROFILE, email: 'hacker@test.local' });
    expect((await me(token)).body.email).toBe(ALICE.email);
  });

  test('AU-U07 PUT /me without a token is refused with 401 (SEC-02)', async () => {
    expect((await request(app).put('/api/users/me').send(PROFILE)).status).toBe(401);
  });

  test.each([['10 digits', '0912345678'], ['11 digits', '09123456789']])(
    'AU-U08 a valid phone is accepted (FR-04: starts with 0, 10-11 digits): %s',
    async (_label, phone) => {
      const token = await loginOk(app, ALICE);
      expect((await update(token, { ...PROFILE, phone })).status).toBe(200);
      expect((await me(token)).body.phone).toBe(phone);
    },
  );
});
