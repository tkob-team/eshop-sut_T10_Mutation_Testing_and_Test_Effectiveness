const h = require('../helpers/coupons');
let app, db, admin, token;
beforeAll(async () => { ({ app, db } = await h.loadApp()); });
beforeEach(async () => {
  h.freeze();
  await h.resetCoupons(db);
  admin = await h.login(app,h.ADMIN);
  token = await h.login(app,h.USER);
});
afterEach(() => jest.useRealTimers());
afterAll(async () => { if(db) await new Promise((resolve,reject) => db.close(error => error ? reject(error) : resolve())); });
async function createLimitThree() {
  const res = await h.request(app).post('/api/admin/coupons').set(h.bearer(admin)).send({ ...h.validAdminCoupon(), code:'MANUAL_LIMIT',max_uses_per_user:3 });
  expect(res.status).toBe(200);
  return res.body.id;
}
const quote = () => h.request(app).post('/api/apply-coupon').set(h.bearer(token)).send({code:'MANUAL_LIMIT',total_amount:100000,user_id:2});
async function consume(id,n) {
  for(let i=0;i<n;i++) expect((await h.request(app).post('/api/coupon-usage').set(h.bearer(token)).send({coupon_id:id})).status).toBe(200);
}
test('MF-01 Admin input limit 3 is persisted as 3 (FR-17; mutants 111/113)', async () => {
  await createLimitThree();
  const listed = await h.request(app).get('/api/coupons').set(h.bearer(admin));
  expect(listed.status).toBe(200);
  expect(listed.body).toHaveLength(1);
  expect(listed.body[0].max_uses_per_user).toBe(3);
});
test('MF-02 usage 2 is below configured limit 3 (FR-09 C5; mutants 111/113)', async () => {
  const id=await createLimitThree();
  await consume(id,2);
  const allowed=await quote();
  expect(allowed.status).toBe(200);
  expect(allowed.body).toMatchObject({discount_amount:25000,final_amount:75000});
  expect(await h.count(db,'coupon_usage')).toBe(2);
});
test('MF-03 usage 3 meets configured limit 3 and is refused (FR-09 C5)', async () => {
  const id=await createLimitThree();
  await consume(id,3);
  const refused=await quote();
  expect(refused.status).toBe(400); // shared HTTP convention, not an exact SRS code
  expect(refused.body).not.toHaveProperty('discount_amount');
  expect(await h.count(db,'coupon_usage')).toBe(3);
});
