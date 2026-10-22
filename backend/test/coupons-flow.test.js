// Agent-authored S3-C02 API scenario. Separate API calls; no atomic checkout claim.
const h = require('./helpers/coupons');
let app, db;
beforeAll(async () => { ({ app, db } = await h.loadApp()); });
afterAll(async () => { if (db) await new Promise((resolve,reject) => db.close(e => e ? reject(e) : resolve())); });
afterEach(() => jest.useRealTimers());
test('CP-FLOW fixed quote -> checkout -> explicit usage recording -> limit enforced', async () => {
  h.freeze();
  await h.resetCoupons(db);
  const token = await h.login(app, h.USER);
  const auth = h.bearer(token);
  const coupon = await h.seedCoupon(db, { max_uses_per_user: 1 });
  const add = await h.request(app).post('/api/cart').set(auth).send({ id: 4, price: 6000000, quantity: 1 });
  expect(add.status).toBe(200);
  const quote = await h.request(app).post('/api/apply-coupon').set(auth).send({ code: coupon.code, total_amount: 6000000, user_id: 2 });
  expect(quote.status).toBe(200);
  expect(quote.body).toMatchObject({ discount_amount: 50000, final_amount: 5950000 });
  const checkout = await h.request(app).post('/api/checkout').set(auth).send({ total_amount: 5950000, shipping_address: '123 Le Loi' });
  expect(checkout.status).toBe(200);
  expect(await h.count(db, 'coupon_usage')).toBe(0);
  const record = await h.request(app).post('/api/coupon-usage').set(auth).send({ coupon_id: coupon.id });
  expect(record.status).toBe(200);
  expect(await h.count(db, 'coupon_usage')).toBe(1);
  const again = await h.request(app).post('/api/apply-coupon').set(auth).send({ code: coupon.code, total_amount: 6000000, user_id: 2 });
  expect(again.status).toBe(400);
  expect(again.body).not.toHaveProperty('discount_amount');
});
