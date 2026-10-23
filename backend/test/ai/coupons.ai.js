const h = require('../helpers/coupons');
const scenarios = require('../helpers/coupons-scenarios');
let app, db, admin, token;
beforeAll(async () => { ({ app, db } = await h.loadApp()); });
beforeEach(async () => {
  h.freeze();
  await h.resetCoupons(db);
  admin = await h.login(app, h.ADMIN);
  token = await h.login(app, h.USER);
});
afterEach(() => jest.useRealTimers());
afterAll(async () => { if (db) await new Promise((resolve,reject) => db.close(error => error ? reject(error) : resolve())); });
test.each([2,4])('AI: admin limit %i persists and controls the per-user boundary (FR-17, FR-09 C5)', async limit => {
  const input = { ...h.validAdminCoupon(), code: 'AI_LIMIT', max_uses_per_user: limit };
  const created = await h.request(app).post('/api/admin/coupons').set(h.bearer(admin)).send(input);
  expect(created.status).toBe(200);
  const listed = await h.request(app).get('/api/coupons').set(h.bearer(admin));
  expect(listed.status).toBe(200);
  expect(listed.body).toHaveLength(1);
  expect(listed.body[0].max_uses_per_user).toBe(limit);
  const quote = () => h.request(app).post('/api/apply-coupon').set(h.bearer(token)).send({ code: 'AI_LIMIT', total_amount: 100000, user_id: 2 });
  const consume = () => h.request(app).post('/api/coupon-usage').set(h.bearer(token)).send({ coupon_id: created.body.id });
  for (let i=0; i<limit-1; i++) expect((await consume()).status).toBe(200);
  const allowed = await quote();
  expect(allowed.status).toBe(200);
  expect(allowed.body).toMatchObject({ discount_amount: 25000, final_amount: 75000 });
  expect((await consume()).status).toBe(200);
  const blocked = await quote();
  expect(blocked.status).toBe(400); // error status convention shared with frozen tests
  expect(blocked.body).not.toHaveProperty('discount_amount');
  expect(await h.count(db,'coupon_usage')).toBe(limit);
});

test('AG-01 the requested code selects its own coupon and discount (FR-09 C1)', async () => {
  await scenarios.selectCorrectCoupon(app, admin, token);
});

test.each([[399999, false], [400001, true]])(
  'AG-02 admin-created minimum 400000 controls total %i (FR-17, FR-09 C3)', async (total, allowed) => {
    await scenarios.enforceCreatedMinimum(app, admin, token, total, allowed);
  });

test.each([
  ['2026-10-24T08:59:59.999Z', true],
  ['2026-10-24T09:00:00.001Z', false],
])('AG-03 admin-created expiry controls quote at %s (FR-17, FR-09 C2)', async (instant, allowed) => {
  await scenarios.enforceCreatedExpiry(app, admin, instant, allowed);
});

test('AG-04 recording usage affects only that user and coupon (FR-09 C5)', async () => {
  await scenarios.isolateRecordedUsage(app, admin, token);
});

test('AG-05 duplicate creation preserves the existing coupon and its discount (FR-17)', async () => {
  const original = await scenarios.createCoupon(app, admin, {
    code: 'DUPLICATE_RULE', discount_value: 27000, min_order_amount: 400000, max_uses_per_user: 3,
  });
  const duplicate = await h.request(app).post('/api/admin/coupons').set(h.bearer(admin))
    .send({ ...h.validAdminCoupon(), code: original.code, discount_value: 90000, max_uses_per_user: 9 });
  // The current API returns 500 for UNIQUE errors; the SRS does not prescribe 409.
  expect(duplicate.status).toBeGreaterThanOrEqual(400);
  expect(duplicate.status).toBeLessThan(600);
  const listed = await scenarios.listCoupons(app, admin);
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject(original);
  scenarios.expectDiscount(await scenarios.quote(app, token, original.code, 700000), original.id, 27000, 673000);
});

test('AG-06 deleting one coupon prevents its use and preserves another (FR-17, FR-09 C1)', async () => {
  const victim = await scenarios.createCoupon(app, admin, { code: 'DELETE_A', discount_value: 10000 });
  const keep = await scenarios.createCoupon(app, admin, { code: 'DELETE_B', discount_value: 27000 });
  const deleted = await h.request(app).delete('/api/admin/coupons/' + victim.id).set(h.bearer(admin));
  expect(deleted.status).toBe(200);
  scenarios.expectRefusedQuote(await scenarios.quote(app, token, victim.code, 100000));
  scenarios.expectDiscount(await scenarios.quote(app, token, keep.code, 100000), keep.id, 27000, 73000);
});

test('AG-07 admin list returns every created coupon with its own configuration (FR-17)', async () => {
  const first = await scenarios.createCoupon(app, admin, { code: 'LIST_A', discount_value: 10000 });
  const second = await scenarios.createCoupon(app, admin, { code: 'LIST_B', discount_value: 27000, max_uses_per_user: 3 });
  const third = await scenarios.createCoupon(app, admin, { code: 'LIST_C', discount_value: 39000, min_order_amount: 200000 });
  const listed = await scenarios.listCoupons(app, admin);
  expect(listed).toHaveLength(3);
  expect(listed).toEqual(expect.arrayContaining([
    expect.objectContaining(first), expect.objectContaining(second), expect.objectContaining(third),
  ]));
});

test.each(['list', 'create', 'delete'])(
  'AG-08 invalid JWT cannot %s coupons or change stored data (FR-12, API 5.2/6.4)', async action => {
    const original = await scenarios.createCoupon(app, admin, { code: 'PROTECTED', discount_value: 27000 });
    const req = action === 'list' ? h.request(app).get('/api/coupons')
      : action === 'create' ? h.request(app).post('/api/admin/coupons').send({ ...h.validAdminCoupon(), code: 'UNAUTHORIZED' })
      : h.request(app).delete('/api/admin/coupons/' + original.id);
    const response = await req.set(h.bearer('invalid-token'));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    const listed = await scenarios.listCoupons(app, admin);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject(original);
  });
