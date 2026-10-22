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
   * Survivor 1
   * Route: POST /api/cart & GET /api/cart
   * Spec Reference: README.md § FR-07 & api_specification.md § 4.2
   * Target Code: server.js:284-295 (In-memory userCarts)
   * Goal: Kill mutant bỏ qua việc push item vào mảng userCarts hoặc trả về sai cấu trúc giỏ hàng.
   */
  test('Survivor 1: POST & GET /api/cart - Verify item stored correctly in user cart array', async () => {
    const user = await newUser(app);
    const cartItem = { product_id: 1, quantity: 2, price: 50000 };

    // 1. Thêm món vào giỏ hàng
    const resPost = await request(app)
      .post('/api/cart')
      .set(bearer(user.token))
      .send(cartItem);

    expect(resPost.status).toBe(200);
    expect(resPost.body.message).toBe('Added to cart');

    // 2. Lấy giỏ hàng và kiểm tra dữ liệu
    const resGet = await request(app)
      .get('/api/cart')
      .set(bearer(user.token));

    expect(resGet.status).toBe(200);
    expect(Array.isArray(resGet.body)).toBe(true);
    expect(resGet.body.length).toBe(1);
    expect(resGet.body[0]).toEqual(cartItem);
  });

  /**
   * Survivor 2
   * Route: POST /api/checkout
   * Spec Reference: README.md § FR-08 & api_specification.md § 4.3
   * Target Code: server.js:297-308 (Checkout and DB insert)
   * Goal: Kill mutant tính sai orderId, lưu sai total_amount hoặc status khác 'pending' trong DB.
   */
  test('Survivor 2: POST /api/checkout - Verify successful order creation and DB pending status', async () => {
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
   * Survivor 4
   * Route: POST /api/apply-coupon
   * Spec Reference: README.md § FR-12 & api_specification.md § 5.2
   * Target Code: server.js:351-428 (Coupon application & discount math)
   * Goal: Kill mutant đổi toán tử so sánh min_order_amount, tính sai discount_amount hoặc final_amount.
   */
  test('Survivor 4: POST /api/apply-coupon - Verify correct discount calculation and min order requirement', async () => {
    // 1. Trường hợp đơn hàng không đủ giá trị tối thiểu (min_order_amount)
    // Giả sử mã seed có min_order_amount = 100000
    const coupon = await get(db, 'SELECT * FROM coupons WHERE is_active = 1 LIMIT 1');
    
    if (coupon) {
      const resUnderMin = await request(app)
        .post('/api/apply-coupon')
        .send({
          code: coupon.code,
          total_amount: coupon.min_order_amount - 1000
        });

      expect(resUnderMin.status).toBe(400);
      expect(resUnderMin.body.error).toContain('Đơn hàng chưa đủ giá trị tối thiểu');

      // 2. Trường hợp áp dụng hợp lệ
      const validAmount = coupon.min_order_amount + 50000;
      const resValid = await request(app)
        .post('/api/apply-coupon')
        .send({
          code: coupon.code,
          total_amount: validAmount
        });

      expect(resValid.status).toBe(200);
      expect(resValid.body.success).toBe(true);

      let expectedDiscount = 0;
      if (coupon.type === 'percent') {
        expectedDiscount = Math.floor(validAmount * (1 - coupon.discount_value));
      } else {
        expectedDiscount = coupon.discount_value;
      }

      expect(resValid.body.discount_amount).toBe(expectedDiscount);
      expect(resValid.body.final_amount).toBe(validAmount - expectedDiscount);
    }
  });

  /**
   * Survivor 5
   * Route: PUT /api/admin/orders/:id/status
   * Spec Reference: api_specification.md § 6.3
   * Target Code: server.js:463-504 (Admin state transition)
   * Goal: Kill mutant bỏ qua kiểm tra chuyển trạng thái hợp lệ hoặc không lưu trạng thái mới vào DB.
   */
  test('Survivor 5: PUT /api/admin/orders/:id/status - Verify state transition rules and status update', async () => {
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

    // 3. Xắc nhận DB đã được cập nhật sang 'confirmed'
    const dbStatus = await orderStatus(db, orderId);
    expect(dbStatus).toBe('confirmed');
  });

});