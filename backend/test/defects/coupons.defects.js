// Original defects: expected from README FR-09/12/17, NOT part of baseline.
// HTTP refusal means 4xx by explicit test convention where the SRS omits codes.
const h = require('../helpers/coupons');
let app,db,token,admin;
beforeAll(async () => { ({app,db} = await h.loadApp()); });
beforeEach(async () => {
  h.freeze(); await h.resetCoupons(db);
  token = await h.login(app,h.USER); admin = await h.login(app,h.ADMIN);
});
afterEach(() => jest.useRealTimers());
afterAll(async () => { if(db) await new Promise((resolve,reject) => db.close(e => e ? reject(e) : resolve())); });
function apply(body = {}, auth = token) {
  const req = h.request(app).post('/api/apply-coupon');
  if(auth) req.set(h.bearer(auth));
  return req.send({code:'FIXED50',total_amount:700000,user_id:2,...body});
}
const refused = res => res.status >= 400 && res.status < 500;
test('CD-01 exact minimum must be accepted (FR-09 C3 >=)', async () => {
  await h.seedCoupon(db);
  const res = await apply({total_amount:500000});
  expect({status:res.status,discount:res.body.discount_amount,final:res.body.final_amount})
    .toEqual({status:200,discount:50000,final:450000});
});
test('CD-02 10 percent means divide by 100 (FR-09 formula)', async () => {
  await h.seedCoupon(db,{type:'percent',discount_value:10});
  const res = await apply({});
  expect({status:res.status,discount:res.body.discount_amount,final:res.body.final_amount})
    .toEqual({status:200,discount:70000,final:630000});
});
test('CD-03 exactly at expiry is invalid (FR-09 C2 now < expiry)', async () => {
  await h.seedCoupon(db); h.freeze(h.EXPIRY);
  token = await h.login(app,h.USER);
  const res = await apply({});
  expect({refused:refused(res),usage:await h.count(db,'coupon_usage')})
    .toEqual({refused:true,usage:0});
});
test.each(['absent','invalid'])('CD-04 %s JWT cannot apply a valid coupon (FR-09 C4)', async kind => {
  await h.seedCoupon(db);
  expect(refused(await apply({},kind === 'absent' ? null : 'invalid-token'))).toBe(true);
});
test.each(['omitted','another-user'])('CD-05 body user_id %s cannot bypass my limit (FR-09 C4/C5)', async kind => {
  const coupon = await h.seedCoupon(db);
  await h.seedUsage(db,coupon.id,2,2);
  const res = await apply({user_id:kind === 'omitted' ? undefined : 1});
  expect({refused:refused(res),usage:await h.count(db,'coupon_usage')})
    .toEqual({refused:true,usage:2});
});
test.each(['list','create','delete'])('CD-06 ordinary user cannot %s coupons (FR-12, SEC-03; API 5.2)', async action => {
  const coupon = await h.seedCoupon(db);
  const req = action === 'list' ? h.request(app).get('/api/coupons')
    : action === 'create' ? h.request(app).post('/api/admin/coupons').send(h.validAdminCoupon())
    : h.request(app).delete('/api/admin/coupons/'+coupon.id);
  const res = await req.set(h.bearer(token));
  expect({refused:refused(res),rows:await h.count(db,'coupons')})
    .toEqual({refused:true,rows:1});
});
test.each([
  ['missing-code',{code:undefined}],
  ['missing-type',{type:undefined}],
  ['missing-discount',{discount_value:undefined}],
  ['missing-minimum',{min_order_amount:undefined}],
  ['missing-uses',{max_uses_per_user:undefined}],
  ['unknown-type',{type:'cashback'}],
  ['zero-discount',{discount_value:0}],
  ['negative-discount',{discount_value:-1}],
  ['negative-minimum',{min_order_amount:-1}],
  ['zero-uses',{max_uses_per_user:0}],
  ['negative-uses',{max_uses_per_user:-1}],
  ['missing-expiry',{expired_at:undefined}],
])('CD-07 admin validation: %s is refused without insertion (FR-17)', async (_name,invalid) => {
  const res = await h.request(app).post('/api/admin/coupons').set(h.bearer(admin))
    .send({...h.validAdminCoupon(),...invalid});
  expect({refused:refused(res),rows:await h.count(db,'coupons')})
    .toEqual({refused:true,rows:0});
});
