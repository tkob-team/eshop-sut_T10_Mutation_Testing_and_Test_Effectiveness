// Test-only fixtures. Real SQLite and SUT SQL; no production edits.
const { loadApp, login, ADMIN, bearer, request, get } = require('./app');
const NOW = '2026-10-22T12:00:00.000Z';
const EXPIRY = '2026-10-23T12:00:00.000Z';
const USER = { email: 'test@eshop.com', password: 'Test1234!' };
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
  }));
}
function freeze(iso = NOW) {
  jest.useFakeTimers({ now: Date.parse(iso), doNotFake: [
    'nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'hrtime',
  ] });
}
async function resetCoupons(db) {
  await run(db, 'DELETE FROM coupon_usage');
  await run(db, 'DELETE FROM coupons');
  await run(db, "DELETE FROM sqlite_sequence WHERE name IN ('coupons', 'coupon_usage')");
  await run(db, 'UPDATE users SET login_attempts = 0, locked_until = NULL');
}
async function seedCoupon(db, overrides = {}) {
  const c = { code: 'FIXED50', type: 'fixed', discount_value: 50000,
    min_order_amount: 500000, expired_at: EXPIRY, is_active: 1, max_uses_per_user: 2,
    ...overrides };
  const row = await run(db, `INSERT INTO coupons
    (code,type,discount_value,min_order_amount,expired_at,is_active,max_uses_per_user)
    VALUES (?,?,?,?,?,?,?)`, Object.values(c));
  return { ...c, id: row.id };
}
async function seedUsage(db, couponId, userId, count) {
  for (let i = 0; i < count; i++) {
    await run(db, 'INSERT INTO coupon_usage(coupon_id,user_id) VALUES (?,?)', [couponId,userId]);
  }
}
async function count(db, table) {
  // Only test-owned table identifiers are accepted; values still use bind parameters.
  if (!['coupons','coupon_usage'].includes(table)) throw new Error('Unsupported fixture table');
  return (await get(db, 'SELECT COUNT(*) AS n FROM ' + table)).n;
}
const validAdminCoupon = () => ({ code: 'NEW_FIXED', type: 'fixed', discount_value: 25000,
  min_order_amount: 0, expired_at: EXPIRY, max_uses_per_user: 1 });
module.exports = { loadApp, login, ADMIN, USER, bearer, request, get, run,
  NOW, EXPIRY, freeze, resetCoupons, seedCoupon, seedUsage, count, validAdminCoupon };

