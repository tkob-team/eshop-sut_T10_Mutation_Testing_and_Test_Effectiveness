// Nạp EShop backend đã cô lập (xem isolate.js), đợi seed xong và cung cấp helpers cho tests.
const request = require('supertest');

const ADMIN = { email: 'admin@eshop.com', password: 'Admin123!' }; // tài khoản seed (README §1)

async function loadApp() {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  require('../../server');
  const db = require('../../database');
  const app = global.__ESHOP_APP__;
  // database.js seed bất đồng bộ (Experiment Log C01-6): đợi bảng seed cuối (coupons) đủ 4 dòng.
  for (let i = 0; i < 200; i++) {
    const n = await get(db, 'SELECT COUNT(*) AS n FROM coupons').then((r) => r.n, () => 0);
    if (n === 4) return { app, db };
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Seed did not finish');
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))),
  );
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, (err) => (err ? reject(err) : resolve())),
  );
}

async function login(app, { email, password }) {
  const res = await request(app).post('/api/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status}`);
  return res.body.token;
}

let seq = 0;
// Mỗi test dùng user mới để giỏ hàng/đơn hàng không ảnh hưởng nhau.
async function newUser(app) {
  seq += 1;
  const email = `co_user${seq}@test.local`;
  const password = 'Password123!';
  const res = await request(app).post('/api/register').send({ name: `CO User ${seq}`, email, password });
  if (res.status !== 200) throw new Error(`register failed: ${res.status}`);
  return { id: res.body.id, token: await login(app, { email, password }) };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// Fixture: tạo đơn qua API checkout rồi đặt status trực tiếp trong DB,
// để setup không phụ thuộc vào logic chuyển trạng thái đang được test.
async function createOrder(app, db, token, status = 'pending') {
  const res = await request(app)
    .post('/api/checkout')
    .set(bearer(token))
    .send({ total_amount: 100000, shipping_address: '123 Le Loi, TP.HCM' });
  if (res.status !== 200) throw new Error(`checkout failed: ${res.status}`);
  if (status !== 'pending') await run(db, 'UPDATE orders SET status = ? WHERE id = ?', [status, res.body.orderId]);
  return res.body.orderId;
}

const orderStatus = (db, id) => get(db, 'SELECT status FROM orders WHERE id = ?', [id]).then((r) => r.status);

module.exports = { ADMIN, loadApp, login, newUser, bearer, createOrder, orderStatus, get, request };
