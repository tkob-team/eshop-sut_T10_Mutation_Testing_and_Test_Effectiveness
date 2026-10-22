// S3-G01 — Cart & Orders, AI Agent assertions (đã review).
// Sinh trong session sạch, không thấy nhánh manual (s3/F01-manual) hay kết quả F01.
// Prompt và output nguyên văn ghi ở AI Record; expected results theo README.md (SRS) và api_specification.md.
// Mọi test ở file này phải PASS trên code gốc.
const { ADMIN, loadApp, login, newUser, bearer, createOrder, orderStatus, get, request } = require('../helpers/app');

let app;
let db;
let adminToken;

beforeAll(async () => {
  ({ app, db } = await loadApp());
  adminToken = await login(app, ADMIN);
});

// AI assertions đã review đặt ở đây.

// ---------------------------------------------------------------------------
// G01-1-cc — raw AI assertions (Claude Code, claude-opus-5-5), CHƯA review.
// Mục tiêu: 6 mutant Survived của E01-1-cc trong server.js. Mutant 550:11
// ConditionalExpression → false KHÔNG có test (xem G01-cc-REPORT.md): muốn kill nó
// phải assert canceled → delivered = 200, trái FR-10 (canceled là trạng thái kết thúc).
// ---------------------------------------------------------------------------

const itemA = { id: 1, name: 'iPhone 15 Pro Max', price: 30000000, quantity: 2 };
const itemB = { id: 4, name: 'Tai nghe AirPods Pro 2', price: 6000000, quantity: 1 };

describe('AI — Cart contents (spec §4.1–4.2, FR-07)', () => {
  // Mutant: server.js 286:7 ConditionalExpression → false (GET /api/cart không khởi tạo giỏ → res.json(undefined)).
  // FR-07 / spec §4.1: user mới có giỏ hàng trống.
  // Oracle: "trống" từ FR-07; dạng mảng JSON `[]` lấy từ code (server.js:286–287) vì spec §4.1 không mô tả response.
  test('AI-CO-01 new user GET /api/cart → 200 with an empty array', async () => {
    const { token } = await newUser(app);
    const res = await request(app).get('/api/cart').set(bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([]);
  });

  // Mutant: server.js 292:7 ConditionalExpression → true (POST /api/cart luôn reset giỏ → chỉ còn item cuối).
  // FR-07 / spec §4.2: thêm hai sản phẩm khác nhau thì giỏ chứa cả hai (hai dòng).
  // Oracle: FR-07 (danh sách sản phẩm trong giỏ) + body §4.2 (id, name, price, quantity);
  // dạng mảng item lấy từ code (server.js:293). Không giả định thứ tự (spec không nói).
  test('AI-CO-02 add two different products → GET /api/cart returns both', async () => {
    const { token } = await newUser(app);
    const a = await request(app).post('/api/cart').set(bearer(token)).send(itemA);
    const b = await request(app).post('/api/cart').set(bearer(token)).send(itemB);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const cart = await request(app).get('/api/cart').set(bearer(token));
    expect(cart.status).toBe(200);
    expect(cart.body).toHaveLength(2);
    expect(cart.body).toEqual(
      expect.arrayContaining([expect.objectContaining(itemA), expect.objectContaining(itemB)]),
    );
  });
});

describe('AI — 404 error bodies (spec §4.5, §4.6, §6.2, FR-10, FR-18)', () => {
  // Ba test dưới cùng một oracle yếu: SRS/spec KHÔNG định nghĩa body lỗi 404.
  // Lấy theo FR-10 "trả về lỗi với thông báo phù hợp" (mở rộng sang lỗi không tìm thấy đơn);
  // tên trường `error` lấy từ code (server.js:326, 346, 532). Chỉ assert có thông báo
  // (string không rỗng), không assert nguyên văn "Order not found".

  // Mutant: server.js 326:47 ObjectLiteral → {} (PUT /api/orders/:id/cancel trả 404 với body rỗng).
  // FR-10, spec §4.6.
  test('AI-CO-03 cancel a non-existent order → 404 with an error message', async () => {
    const { token } = await newUser(app);
    const res = await request(app).put('/api/orders/999999/cancel').set(bearer(token));
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  // Mutant: server.js 346:45 ObjectLiteral → {} (GET /api/orders/:id trả 404 với body rỗng).
  // Spec §4.5.
  test('AI-CO-04 order detail of non-existent id → 404 with an error message', async () => {
    const { token } = await newUser(app);
    const res = await request(app).get('/api/orders/999999').set(bearer(token));
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  // Mutant: server.js 532:47 ObjectLiteral → {} (PUT /api/admin/orders/:id/status trả 404 với body rỗng).
  // FR-18, spec §6.2.
  test('AI-CO-05 admin changes status of a non-existent order → 404 with an error message', async () => {
    const res = await request(app)
      .put('/api/admin/orders/999999/status')
      .set(bearer(adminToken))
      .send({ status: 'confirmed' });
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });
});
