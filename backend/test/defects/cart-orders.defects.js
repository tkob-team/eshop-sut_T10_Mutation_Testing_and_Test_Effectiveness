// S3-D01 — Cart & Orders: tests ĐÚNG SPEC nhưng FAIL trên code gốc (lỗi gốc của SUT).
// Không thuộc baseline Stryker (testMatch của Jest không nhận *.defects.js).
// Chạy riêng: npm run test:defects — kỳ vọng: mọi test ở đây FAIL trên commit gốc.
const { ADMIN, loadApp, login, newUser, bearer, createOrder, orderStatus, get, request } = require('../helpers/app');

let app;
let db;
let adminToken;

beforeAll(async () => {
  ({ app, db } = await loadApp());
  adminToken = await login(app, ADMIN);
});

const item = { id: 4, name: 'Tai nghe AirPods Pro 2', price: 6000000, quantity: 2 };

test('DEF-01 FR-07: adding the same product again increases quantity, no new line', async () => {
  const { token } = await newUser(app);
  await request(app).post('/api/cart').set(bearer(token)).send(item);
  await request(app).post('/api/cart').set(bearer(token)).send({ ...item, quantity: 1 });
  const cart = await request(app).get('/api/cart').set(bearer(token));
  expect(cart.body).toEqual([{ ...item, quantity: 3 }]);
});

test('DEF-02 FR-08: backend recomputes total from the cart, ignores client total_amount', async () => {
  const user = await newUser(app);
  await request(app).post('/api/cart').set(bearer(user.token)).send(item); // 2 × 6.000.000
  const res = await request(app)
    .post('/api/checkout')
    .set(bearer(user.token))
    .send({ total_amount: 1, shipping_address: 'HCM' });
  const order = await get(db, 'SELECT total_amount FROM orders WHERE id = ?', [res.body.orderId]);
  expect(order.total_amount).toBe(12000000);
});

test('DEF-03 FR-08: cart is cleared after a successful checkout', async () => {
  const user = await newUser(app);
  await request(app).post('/api/cart').set(bearer(user.token)).send(item);
  await request(app).post('/api/checkout').set(bearer(user.token)).send({ total_amount: 12000000, shipping_address: 'HCM' });
  const cart = await request(app).get('/api/cart').set(bearer(user.token));
  expect(cart.body).toEqual([]);
});

test('DEF-04 FR-10/FR-20: user cannot cancel a shipping order', async () => {
  const { token } = await newUser(app);
  const id = await createOrder(app, db, token, 'shipping');
  const res = await request(app).put(`/api/orders/${id}/cancel`).set(bearer(token));
  expect(res.status).toBe(400);
  expect(await orderStatus(db, id)).toBe('shipping');
});

test('DEF-05 FR-10: canceled is a final state, canceled → delivered is rejected', async () => {
  const { token } = await newUser(app);
  const id = await createOrder(app, db, token, 'canceled');
  const res = await request(app)
    .put(`/api/admin/orders/${id}/status`)
    .set(bearer(adminToken))
    .send({ status: 'delivered' });
  expect(res.status).toBe(400);
  expect(await orderStatus(db, id)).toBe('canceled');
});

test('DEF-06 FR-12/SEC-03: non-admin cannot change order status', async () => {
  const user = await newUser(app);
  const id = await createOrder(app, db, user.token);
  const res = await request(app)
    .put(`/api/admin/orders/${id}/status`)
    .set(bearer(user.token))
    .send({ status: 'confirmed' });
  expect([401, 403]).toContain(res.status);
  expect(await orderStatus(db, id)).toBe('pending');
});

test('DEF-07 FR-12/SEC-03: non-admin cannot list all orders', async () => {
  const { token } = await newUser(app);
  const res = await request(app).get('/api/admin/orders').set(bearer(token));
  expect([401, 403]).toContain(res.status);
});

test('DEF-08a spec §4 header, SEC-02: order detail without token is rejected', async () => {
  const owner = await newUser(app);
  const id = await createOrder(app, db, owner.token);

  const anonymous = await request(app).get(`/api/orders/${id}`);
  expect(anonymous.status).toBe(401);
});

test("DEF-08b FR-11: user cannot view another user's order detail", async () => {
  const owner = await newUser(app);
  const other = await newUser(app);
  const id = await createOrder(app, db, owner.token);

  const notOwner = await request(app).get(`/api/orders/${id}`).set(bearer(other.token));
  expect([403, 404]).toContain(notOwner.status);
});
