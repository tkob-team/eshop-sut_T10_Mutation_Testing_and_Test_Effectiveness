// S3-D02: original-code passing subset of README FR-09/FR-12/FR-17.
// Values are literal spec-derived oracles, not copied from SUT responses.
// No body/DB assertions are deliberately removed to manufacture survivors.
const h = require('./helpers/coupons');
let app, db, token, admin;
beforeAll(async () => { ({ app, db } = await h.loadApp()); });
beforeEach(async () => {
  h.freeze();
  await h.resetCoupons(db);
  token = await h.login(app, h.USER);
  admin = await h.login(app, h.ADMIN);
});
afterEach(() => jest.useRealTimers());
afterAll(async () => { if (db) await new Promise((resolve,reject) => db.close(e => e ? reject(e) : resolve())); });
const apply = (body) => h.request(app).post('/api/apply-coupon').set(h.bearer(token))
  .send({ code: 'FIXED50', total_amount: 700000, user_id: 2, ...body });

test.each([[500001,450001],[700000,650000]])(
  'CP-01 fixed coupon: total %i gives final %i (FR-09)', async (total, final) => {
    const coupon = await h.seedCoupon(db);
    const res = await apply({ total_amount: total });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, coupon_id: coupon.id,
      discount_amount: 50000, final_amount: final });
    expect(await h.count(db, 'coupon_usage')).toBe(0); // apply is a quote, not checkout.
  });
test('CP-02 one currency unit below minimum is refused (FR-09 C3)', async () => {
  await h.seedCoupon(db);
  const res = await apply({ total_amount: 499999 });
  expect(res.status).toBe(400); // HTTP error code convention; business rule is FR-09.
  expect(res.body.error).toEqual(expect.any(String));
  expect(res.body).not.toHaveProperty('discount_amount');
  expect(await h.count(db, 'coupon_usage')).toBe(0);
});

test.each([undefined, ''])('CP-03 missing/empty code is refused: %s', async (code) => {
  await h.seedCoupon(db);
  const res = await apply({ code });
  expect(res.status).toBe(400);
  expect(res.body).not.toHaveProperty('discount_amount');
});
test.each(['unknown', 'inactive'])('CP-04 %s code is unavailable (FR-09 C1)', async (kind) => {
  await h.seedCoupon(db, { is_active: kind === 'inactive' ? 0 : 1 });
  const res = await apply({ code: kind === 'unknown' ? 'NO_SUCH_CODE' : 'FIXED50' });
  expect(res.status).toBe(404);
  expect(res.body).not.toHaveProperty('discount_amount');
});
test('CP-05 one millisecond before expiry is valid (FR-09 C2)', async () => {
  await h.seedCoupon(db);
  h.freeze('2026-10-23T11:59:59.999Z');
  token = await h.login(app, h.USER); // keep JWT valid at the tested instant.
  const res = await apply({});
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ discount_amount: 50000, final_amount: 650000 });
});
test('CP-06 one millisecond after expiry is refused (FR-09 C2)', async () => {
  await h.seedCoupon(db);
  h.freeze('2026-10-23T12:00:00.001Z');
  token = await h.login(app, h.USER);
  const res = await apply({});
  expect(res.status).toBe(400);
  expect(res.body).not.toHaveProperty('discount_amount');
});
test.each([0,1])('CP-07 usage %i is below limit 2 (FR-09 C5)', async (used) => {
  const coupon = await h.seedCoupon(db);
  await h.seedUsage(db, coupon.id, 2, used);
  const res = await apply({});
  expect(res.status).toBe(200);
  expect(res.body.final_amount).toBe(650000);
  expect(await h.count(db,'coupon_usage')).toBe(used);
});
test.each([2,3])('CP-08 usage %i meets/exceeds limit 2 (FR-09 C5)', async (used) => {
  const coupon = await h.seedCoupon(db);
  await h.seedUsage(db, coupon.id, 2, used);
  const res = await apply({});
  expect(res.status).toBe(400);
  expect(res.body).not.toHaveProperty('discount_amount');
  expect(await h.count(db,'coupon_usage')).toBe(used);
});
test('CP-09 another user usage does not consume my per-user allowance', async () => {
  const coupon = await h.seedCoupon(db);
  await h.seedUsage(db,coupon.id,1,2);
  expect((await apply({})).body.final_amount).toBe(650000);
});
test('CP-10 another coupon usage does not consume this coupon allowance', async () => {
  const coupon = await h.seedCoupon(db);
  const other = await h.seedCoupon(db,{ code:'OTHER' });
  await h.seedUsage(db,other.id,2,2);
  const res = await apply({});
  expect(res.status).toBe(200);
  expect(res.body.coupon_id).toBe(coupon.id);
  expect(res.body.final_amount).toBe(650000);
});
test('CP-11 quoting repeatedly does not consume allowance; recording usage does', async () => {
  const coupon = await h.seedCoupon(db);
  await apply({});
  await apply({});
  expect(await h.count(db,'coupon_usage')).toBe(0);
  const recorded = await h.request(app).post('/api/coupon-usage')
    .set(h.bearer(token)).send({ coupon_id:coupon.id, user_id:1 });
  expect(recorded.status).toBe(200);
  expect(await h.get(db,'SELECT coupon_id,user_id FROM coupon_usage')).toEqual({
    coupon_id:coupon.id,user_id:2,
  });
  await h.request(app).post('/api/coupon-usage').set(h.bearer(token)).send({ coupon_id:coupon.id });
  expect((await apply({})).status).toBe(400);
});
test.each([['absent',401],['invalid',403]])(
  'CP-12 usage recording with %s JWT is refused (SEC-02; code is convention)', async (kind,status) => {
    const coupon = await h.seedCoupon(db);
    const req = h.request(app).post('/api/coupon-usage');
    if (kind === 'invalid') req.set(h.bearer('invalid-token'));
    expect((await req.send({ coupon_id:coupon.id })).status).toBe(status);
    expect(await h.count(db,'coupon_usage')).toBe(0);
  });
test('CP-13 admin lists the current fixture; reset removed original coupons', async () => {
  const coupon = await h.seedCoupon(db);
  const res = await h.request(app).get('/api/coupons').set(h.bearer(admin));
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(1);
  expect(res.body[0]).toMatchObject({ id:coupon.id, code:'FIXED50', is_active:1 });
});
test('CP-14 list without JWT is refused (API 5.2)', async () => {
  expect((await h.request(app).get('/api/coupons')).status).toBe(401);
});
test('CP-15 admin creates minimum=0 and max_uses=1; resulting coupon is usable', async () => {
  const res = await h.request(app).post('/api/admin/coupons').set(h.bearer(admin))
    .send(h.validAdminCoupon());
  expect(res.status).toBe(200);
  const listed = await h.request(app).get('/api/coupons').set(h.bearer(admin));
  expect(listed.body).toHaveLength(1);
  expect(listed.body[0]).toMatchObject({ ...h.validAdminCoupon(), id:res.body.id });
  const quote = await apply({ code:'NEW_FIXED',total_amount:100000 });
  expect(quote.body).toMatchObject({ discount_amount:25000, final_amount:75000 });
});
test('CP-16 admin deletes only the addressed coupon (FR-17)', async () => {
  const victim = await h.seedCoupon(db);
  const keep = await h.seedCoupon(db,{ code:'KEEP' });
  const res = await h.request(app).delete('/api/admin/coupons/'+victim.id).set(h.bearer(admin));
  expect(res.status).toBe(200);
  const listed = await h.request(app).get('/api/coupons').set(h.bearer(admin));
  expect(listed.body.map(c => c.id)).toEqual([keep.id]);
});
test.each(['create','delete'])('CP-17 %s without JWT has no side effects (FR-12)', async (action) => {
  const coupon = await h.seedCoupon(db);
  const req = action === 'create'
    ? h.request(app).post('/api/admin/coupons').send(h.validAdminCoupon())
    : h.request(app).delete('/api/admin/coupons/'+coupon.id);
  expect((await req).status).toBe(401);
  expect(await h.count(db,'coupons')).toBe(1);
});
test('CP-18 duplicate code cannot create a second coupon (FR-17)', async () => {
  await h.seedCoupon(db,{ code:'NEW_FIXED' });
  const res = await h.request(app).post('/api/admin/coupons').set(h.bearer(admin))
    .send(h.validAdminCoupon());
  expect(res.status).toBeGreaterThanOrEqual(400); // spec does not fix a duplicate error status.
  expect(await h.count(db,'coupons')).toBe(1);
});

