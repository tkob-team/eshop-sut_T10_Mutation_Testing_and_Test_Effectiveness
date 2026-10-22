// S3-F01 — Cart & Orders, manual assertions.
// Tấn Hiệp tự viết (integrity rule: AI không viết assertion, input hay expected cho nhánh này).
// Expected results lấy từ README.md (SRS) và api_specification.md; dẫn FR/§ và mutant mục tiêu cho từng test.
// Mọi test ở file này phải PASS trên code gốc.
const { ADMIN, loadApp, login, newUser, bearer, createOrder, orderStatus, get, request } = require('../helpers/app');

let app;
let db;
let adminToken;

beforeAll(async () => {
  ({ app, db } = await loadApp());
  adminToken = await login(app, ADMIN);
});

describe('Cart & Orders Manual Tests - Tấn Hiệp', () => {

  /**
   * Survivor 3
   * Route: PUT /api/orders/:id/cancel
   * Spec Reference: README.md § FR-10 & api_specification.md § 6.2
   * Target Code: server.js:318-337 (Cancel order)
   * Goal: Kill mutant không cập nhật status thành 'canceled' trong DB hoặc bỏ qua bước UPDATE.
   */
  test('Survivor 3: PUT /api/orders/:id/cancel - Verify pending order is cancelled and DB updated to canceled', async () => {
    const user = await newUser(app);
    // Tạo đơn hàng ở trạng thái 'pending'
    const orderId = await createOrder(app, db, user.token, 'pending');

    // 1. Thực hiện hủy đơn hàng
    const resCancel = await request(app)
      .put(`/api/orders/${orderId}/cancel`)
      .set(bearer(user.token));

    expect(resCancel.status).toBe(200);
    expect(resCancel.body.message).toBe('Order canceled successfully');

    // 2. Kiểm tra status trong DB đã chuyển sang 'canceled'
    const dbStatus = await orderStatus(db, orderId);
    expect(dbStatus).toBe('canceled');
  });

  /**
   * Target Mutant: 286:7 (ConditionalExpression Survived)
   * Route: GET /api/cart
   * Spec Reference: README.md § FR-07 & api_specification.md § 4.1
   * Target Code: server.js:286
   * Goal: Kill mutant 286:7 bằng cách gọi GET /api/cart với user mới chưa có giỏ hàng,
   *       assert phản hồi trả về mảng rỗng [] thay vì undefined.
   */
  test('Kill Mutant 286:7 - GET /api/cart initializes empty cart array for new user', async () => {
    const user = await newUser(app);

    const resGet = await request(app)
      .get('/api/cart')
      .set(bearer(user.token));

    expect(resGet.status).toBe(200);
    expect(resGet.body).toEqual([]);
  });

  /**
   * Target Mutant: 292:7 (ConditionalExpression Survived)
   * Route: POST /api/cart & GET /api/cart
   * Spec Reference: README.md § FR-07 & api_specification.md § 4.2 & § 4.1
   * Target Code: server.js:292
   * Goal: Kill mutant 292:7 bằng cách POST 2 sản phẩm liên tiếp. Nếu mutant biến `if (!userCarts[userId])`
   *       thành `if (true)`, giỏ hàng sẽ bị reset thành [] ở lần POST thứ 2 làm mất item 1.
   *       Assert qua GET /api/cart phải thu được đủ 2 items.
   */
  test('Kill Mutant 292:7 - POST /api/cart preserves existing cart items across multiple additions', async () => {
    const user = await newUser(app);
    const item1 = { product_id: 1, quantity: 2, price: 50000 };
    const item2 = { product_id: 2, quantity: 1, price: 100000 };

    // 1. Thêm sản phẩm thứ nhất
    const resPost1 = await request(app)
      .post('/api/cart')
      .set(bearer(user.token))
      .send(item1);
    expect(resPost1.status).toBe(200);
    expect(resPost1.body.message).toBe('Added to cart');

    // 2. Thêm sản phẩm thứ hai
    const resPost2 = await request(app)
      .post('/api/cart')
      .set(bearer(user.token))
      .send(item2);
    expect(resPost2.status).toBe(200);
    expect(resPost2.body.message).toBe('Added to cart');

    // 3. Lấy giỏ hàng và assert tích lũy đủ 2 items
    const resGet = await request(app)
      .get('/api/cart')
      .set(bearer(user.token));

    expect(resGet.status).toBe(200);
    expect(Array.isArray(resGet.body)).toBe(true);
    expect(resGet.body).toHaveLength(2);
    expect(resGet.body[0]).toEqual(item1);
    expect(resGet.body[1]).toEqual(item2);
  });

  /**
   * Baseline Test / Survivor Coverage
   * Route: POST /api/checkout
   * Spec Reference: README.md § FR-08 & api_specification.md § 4.3
   * Target Code: server.js:297-308 (Checkout and DB insert)
   * Goal: Kiểm tra quá trình tạo đơn hàng và lưu đúng dữ liệu vào database.
   */
  test('POST /api/checkout - Verify successful order creation and DB pending status', async () => {
    const user = await newUser(app);
    const checkoutData = {
      total_amount: 150000,
      shipping_address: '123 Nguyen Hue, Q1, TP.HCM'
    };

    // 1. Thực hiện checkout
    const resCheckout = await request(app)
      .post('/api/checkout')
      .set(bearer(user.token))
      .send(checkoutData);

    expect(resCheckout.status).toBe(200);
    expect(resCheckout.body.message).toBe('Checkout successful');
    expect(typeof resCheckout.body.orderId).toBe('number');

    // 2. Kiểm tra trực tiếp dữ liệu trong DB
    const orderInDb = await get(db, 'SELECT * FROM orders WHERE id = ?', [resCheckout.body.orderId]);
    expect(orderInDb).toBeDefined();
    expect(orderInDb.user_id).toBe(user.id);
    expect(orderInDb.total_amount).toBe(150000);
    expect(orderInDb.status).toBe('pending');
    expect(orderInDb.shipping_address).toBe('123 Nguyen Hue, Q1, TP.HCM');
  });

  /**
   * Target Mutant: 326:47 (ObjectLiteral Survived)
   * Route: PUT /api/orders/:id/cancel
   * Spec Reference: README.md § FR-10 & api_specification.md § 4.6
   * Target Code: server.js:326
   * Goal: Kill mutant 326:47 bằng cách gọi hủy đơn hàng không tồn tại và assert chính xác
   *       body error { error: "Order not found" } thay vì chỉ check HTTP Status 404.
   */
  test('Kill Mutant 326:47 - PUT /api/orders/:id/cancel returns error body when order not found', async () => {
    const user = await newUser(app);
    const nonExistentOrderId = 99999;

    const resCancel = await request(app)
      .put(`/api/orders/${nonExistentOrderId}/cancel`)
      .set(bearer(user.token));

    expect(resCancel.status).toBe(404);
    expect(resCancel.body).toEqual({ error: 'Order not found' });
  });

  /**
   * Target Mutant: 346:45 (ObjectLiteral Survived)
   * Route: GET /api/orders/:id
   * Spec Reference: README.md § FR-11 & api_specification.md § 4.5
   * Target Code: server.js:346
   * Goal: Kill mutant 346:45 bằng cách lấy chi tiết đơn hàng không tồn tại và assert chính xác
   *       body error { error: "Order not found" } thay vì chỉ check HTTP Status 404.
   */
  test('Kill Mutant 346:45 - GET /api/orders/:id returns error body when order not found', async () => {
    const user = await newUser(app);
    const nonExistentOrderId = 99999;

    const resGetOrder = await request(app)
      .get(`/api/orders/${nonExistentOrderId}`)
      .set(bearer(user.token));

    expect(resGetOrder.status).toBe(404);
    expect(resGetOrder.body).toEqual({ error: 'Order not found' });
  });

  /**
   * Target Mutant: 532:47 (ObjectLiteral Survived)
   * Route: PUT /api/admin/orders/:id/status
   * Spec Reference: api_specification.md § 6.2
   * Target Code: server.js:532
   * Goal: Kill mutant 532:47 bằng cách Admin cập nhật trạng thái đơn hàng không tồn tại,
   *       assert chính xác body error { error: "Order not found" } thay vì chỉ check Status 404.
   */
  test('Kill Mutant 532:47 - PUT /api/admin/orders/:id/status returns error body when order not found', async () => {
    const nonExistentOrderId = 99999;

    const resAdminUpdate = await request(app)
      .put(`/api/admin/orders/${nonExistentOrderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'confirmed' });

    expect(resAdminUpdate.status).toBe(404);
    expect(resAdminUpdate.body).toEqual({ error: 'Order not found' });
  });

  /**
   * Baseline Test / State Transitions
   * Route: PUT /api/admin/orders/:id/status
   * Spec Reference: api_specification.md § 6.2
   * Target Code: server.js:525-558 (Admin state transition)
   * Goal: Kiểm tra quy tắc chuyển trạng thái hợp lệ/không hợp lệ và cập nhật DB của Admin.
   */
  test('PUT /api/admin/orders/:id/status - Verify state transition rules and status update', async () => {
    const user = await newUser(app);
    const orderId = await createOrder(app, db, user.token, 'pending');

    // 1. Chuyển trạng thái không hợp lệ (pending -> delivered): Phải báo lỗi 400
    const resInvalid = await request(app)
      .put(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'delivered' });

    expect(resInvalid.status).toBe(400);

    // 2. Chuyển trạng thái hợp lệ (pending -> confirmed): Phải thành công 200
    const resValid = await request(app)
      .put(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send({ status: 'confirmed' });

    expect(resValid.status).toBe(200);
    expect(resValid.body.message).toBe('Order status updated');

    // 3. Xác nhận DB đã được cập nhật sang 'confirmed'
    const dbStatus = await orderStatus(db, orderId);
    expect(dbStatus).toBe('confirmed');
  });

});