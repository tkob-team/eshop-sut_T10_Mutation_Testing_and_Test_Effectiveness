const h = require('./coupons');
const { newUser } = require('./app');

async function createCoupon(app, admin, overrides) {
  const input = { ...h.validAdminCoupon(), ...overrides };
  const response = await h.request(app).post('/api/admin/coupons')
    .set(h.bearer(admin)).send(input);
  expect(response.status).toBe(200);
  expect(response.body.id).toEqual(expect.any(Number));
  return { ...input, id: response.body.id };
}

async function listCoupons(app, admin) {
  const response = await h.request(app).get('/api/coupons').set(h.bearer(admin));
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
  return response.body;
}

function quote(app, token, code, total, userId = 2) {
  return h.request(app).post('/api/apply-coupon').set(h.bearer(token))
    .send({ code, total_amount: total, user_id: userId });
}

function expectDiscount(response, couponId, discount, final) {
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true, coupon_id: couponId, discount_amount: discount, final_amount: final,
  });
}

function expectRefusedQuote(response) {
  // The SRS requires refusal; exact HTTP error codes are API conventions.
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(response.status).toBeLessThan(500);
  expect(response.body).not.toHaveProperty('discount_amount');
  expect(response.body.success).not.toBe(true);
}

async function selectCorrectCoupon(app, admin, token) {
  await createCoupon(app, admin, { code: 'CHOICE_A', discount_value: 10000 });
  const chosen = await createCoupon(app, admin, { code: 'CHOICE_B', discount_value: 27000 });
  expectDiscount(await quote(app, token, chosen.code, 100000), chosen.id, 27000, 73000);
}

async function enforceCreatedMinimum(app, admin, token, total, allowed) {
  const coupon = await createCoupon(app, admin, {
    code: 'MINIMUM_RULE', min_order_amount: 400000, discount_value: 27000,
  });
  const listed = await listCoupons(app, admin);
  expect(listed.find(row => row.id === coupon.id)).toMatchObject({
    min_order_amount: 400000, discount_value: 27000,
  });
  const response = await quote(app, token, coupon.code, total);
  if (allowed) expectDiscount(response, coupon.id, 27000, 373001);
  else expectRefusedQuote(response);
}

async function enforceCreatedExpiry(app, admin, instant, allowed) {
  const coupon = await createCoupon(app, admin, {
    code: 'EXPIRY_RULE', expired_at: '2026-10-24T09:00:00.000Z', discount_value: 27000,
  });
  const listed = await listCoupons(app, admin);
  expect(listed.find(row => row.id === coupon.id).expired_at).toBe('2026-10-24T09:00:00.000Z');
  h.freeze(instant);
  const freshToken = await h.login(app, h.USER);
  const response = await quote(app, freshToken, coupon.code, 100000);
  if (allowed) expectDiscount(response, coupon.id, 27000, 73000);
  else expectRefusedQuote(response);
}

async function isolateRecordedUsage(app, admin, token) {
  const first = await createCoupon(app, admin, { code: 'USAGE_A', discount_value: 10000 });
  const second = await createCoupon(app, admin, { code: 'USAGE_B', discount_value: 27000 });
  const otherUser = await newUser(app);
  // Usage recording is an explicit API call, separate from checkout.
  const recorded = await h.request(app).post('/api/coupon-usage')
    .set(h.bearer(token)).send({ coupon_id: first.id });
  expect(recorded.status).toBe(200);
  expectRefusedQuote(await quote(app, token, first.code, 100000));
  expectDiscount(await quote(app, token, second.code, 100000), second.id, 27000, 73000);
  expectDiscount(await quote(app, otherUser.token, first.code, 100000, otherUser.id), first.id, 10000, 90000);
}

module.exports = {
  createCoupon, listCoupons, quote, expectDiscount, expectRefusedQuote,
  selectCorrectCoupon, enforceCreatedMinimum, enforceCreatedExpiry, isolateRecordedUsage,
};
