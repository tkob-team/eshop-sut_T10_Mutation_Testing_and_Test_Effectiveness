const eligible = require('./eligibility');
test('exactly at the inclusive minimum qualifies', () => {
  expect(eligible(100,100)).toBe(true);
});

