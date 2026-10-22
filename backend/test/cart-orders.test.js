// S3-D01 — Cart & Orders, baseline suite.
// Expected results: README.md (SRS: FR-07, FR-08, FR-10, FR-11, FR-18) và api_specification.md §4, §6.2.
// Mức assertion của baseline: CHỈ status code (quyết định 2026-10-18, xem Experiment Log mục D01).
// Assertion về response body và dữ liệu DB được bổ sung ở S3-F01 (manual) và S3-G01 (Claude).
// Mọi test ở file này phải PASS trên code gốc. Test đúng spec nhưng fail trên code gốc nằm ở test/defects/.
const { ADMIN, loadApp, login, newUser, bearer, createOrder, request } = require('./helpers/app');

let app;
let db;
let adminToken;

beforeAll(async () => {
  ({ app, db } = await loadApp());
  adminToken = await login(app, ADMIN);
});

const itemA = { id: 1, name: 'iPhone 15 Pro Max', price: 30000000, quantity: 2 };
const itemB = { id: 4, name: 'Tai nghe AirPods Pro 2', price: 6000000, quantity: 1 };

describe('Cart — GET/POST /api/cart (spec §4.1–4.2, FR-07)', () => {
  test('CO-01 [invalid] get cart without token → 401', async () => {
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(401);
  });

  test('CO-02 [normal] new user gets an empty cart', async () => {
    const { token } = await newUser(app);
    const res = await request(app).get('/api/cart').set(bearer(token));
    expect(res.status).toBe(200);
  });

  test('CO-03 [normal] add one item, then read the cart', async () => {
    const { token } = await newUser(app);
    const add = await request(app).post('/api/cart').set(bearer(token)).send(itemA);
    expect(add.status).toBe(200);
    const cart = await request(app).get('/api/cart').set(bearer(token));
    expect(cart.status).toBe(200);
  });

  test('CO-04 [normal] add two different products', async () => {
    const { token } = await newUser(app);
    const a = await request(app).post('/api/cart').set(bearer(token)).send(itemA);
    const b = await request(app).post('/api/cart').set(bearer(token)).send(itemB);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  test('CO-05 [normal] another user reads own cart after user 1 adds an item', async () => {
    const u1 = await newUser(app);
    const u2 = await newUser(app);
    await request(app).post('/api/cart').set(bearer(u1.token)).send(itemA);
    const cart2 = await request(app).get('/api/cart').set(bearer(u2.token));
    expect(cart2.status).toBe(200);
  });
});

describe('Checkout & order history — POST /api/checkout, GET /api/orders/my-orders (spec §4.3–4.4, FR-08, FR-11)', () => {
  test('CO-06 [invalid] checkout without token → 401', async () => {
    const res = await request(app).post('/api/checkout').send({ total_amount: 100000, shipping_address: 'HCM' });
    expect(res.status).toBe(401);
  });

  test('CO-07 [normal] checkout with cart total and address', async () => {
    const user = await newUser(app);
    await request(app).post('/api/cart').set(bearer(user.token)).send({ ...itemB, quantity: 2 });
    const res = await request(app)
      .post('/api/checkout')
      .set(bearer(user.token))
      .send({ total_amount: itemB.price * 2, shipping_address: '123 Le Loi, TP.HCM' });
    expect(res.status).toBe(200);
  });

  test('CO-08 [normal] user reads own order history (another user also has an order)', async () => {
    const u1 = await newUser(app);
    const u2 = await newUser(app);
    await createOrder(app, db, u1.token);
    await createOrder(app, db, u1.token);
    await createOrder(app, db, u2.token);
    const res = await request(app).get('/api/orders/my-orders').set(bearer(u1.token));
    expect(res.status).toBe(200);
  });
});

describe('Order detail & admin list — GET /api/orders/:id, GET /api/admin/orders (spec §4.5, §6.2, FR-18)', () => {
  test('CO-09 [normal] owner reads order detail by id', async () => {
    const user = await newUser(app);
    const id = await createOrder(app, db, user.token);
    const res = await request(app).get(`/api/orders/${id}`).set(bearer(user.token));
    expect(res.status).toBe(200);
  });

  test('CO-10 [invalid] order detail of non-existent id → 404', async () => {
    const { token } = await newUser(app);
    const res = await request(app).get('/api/orders/999999').set(bearer(token));
    expect(res.status).toBe(404);
  });

  test('CO-11 [normal] admin lists orders of all users', async () => {
    const u1 = await newUser(app);
    const u2 = await newUser(app);
    await createOrder(app, db, u1.token);
    await createOrder(app, db, u2.token);
    const res = await request(app).get('/api/admin/orders').set(bearer(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('User cancels order — PUT /api/orders/:id/cancel (spec §4.6, FR-10, FR-20)', () => {
  test.each(['pending', 'confirmed'])('CO-12 [normal] cancel a %s order → 200', async (from) => {
    const { token } = await newUser(app);
    const id = await createOrder(app, db, token, from);
    const res = await request(app).put(`/api/orders/${id}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
  });

  test.each(['delivered', 'canceled'])('CO-13 [invalid] cancel a %s order (final state) → 400', async (from) => {
    const { token } = await newUser(app);
    const id = await createOrder(app, db, token, from);
    const res = await request(app).put(`/api/orders/${id}/cancel`).set(bearer(token));
    expect(res.status).toBe(400);
  });

  test('CO-14 [invalid] cancel another user\'s order → 404', async () => {
    const owner = await newUser(app);
    const other = await newUser(app);
    const id = await createOrder(app, db, owner.token);
    const res = await request(app).put(`/api/orders/${id}/cancel`).set(bearer(other.token));
    expect(res.status).toBe(404);
  });

  test('CO-15 [invalid] cancel a non-existent order → 404', async () => {
    const { token } = await newUser(app);
    const res = await request(app).put('/api/orders/999999/cancel').set(bearer(token));
    expect(res.status).toBe(404);
  });

  test('CO-16 [invalid] cancel without token → 401', async () => {
    const res = await request(app).put('/api/orders/1/cancel');
    expect(res.status).toBe(401);
  });
});

describe('Admin order status — PUT /api/admin/orders/:id/status (spec §6.2, FR-10, FR-18)', () => {
  const setStatus = (id, status) =>
    request(app).put(`/api/admin/orders/${id}/status`).set(bearer(adminToken)).send({ status });

  // Boundary của state machine FR-10: từng cạnh hợp lệ.
  test.each([
    ['pending', 'confirmed'],
    ['confirmed', 'shipping'],
    ['shipping', 'delivered'],
    ['pending', 'canceled'],
    ['confirmed', 'canceled'],
  ])('CO-17 [normal] %s → %s → 200', async (from, to) => {
    const { token } = await newUser(app);
    const id = await createOrder(app, db, token, from);
    const res = await setStatus(id, to);
    expect(res.status).toBe(200);
  });

  // Cạnh không có trong FR-10, chuyển từ trạng thái kết thúc, và status không tồn tại.
  // Không có: shipping → canceled (FR-10 chưa rõ, xem Experiment Log);
  //           canceled → delivered (đúng spec phải 400 nhưng code trả 200 → test/defects/, DEF-05).
  test.each([
    ['pending', 'shipping'],
    ['pending', 'delivered'],
    ['confirmed', 'delivered'],
    ['confirmed', 'pending'],
    ['shipping', 'pending'],
    ['shipping', 'confirmed'],
    ['delivered', 'pending'],
    ['delivered', 'shipping'],
    ['delivered', 'canceled'],
    ['canceled', 'pending'],
    ['canceled', 'confirmed'],
    ['pending', 'unknown_status'],
  ])('CO-18 [invalid] %s → %s → 400', async (from, to) => {
    const { token } = await newUser(app);
    const id = await createOrder(app, db, token, from);
    const res = await setStatus(id, to);
    expect(res.status).toBe(400);
  });

  test('CO-19 [invalid] change status of a non-existent order → 404', async () => {
    const res = await setStatus(999999, 'confirmed');
    expect(res.status).toBe(404);
  });
});
