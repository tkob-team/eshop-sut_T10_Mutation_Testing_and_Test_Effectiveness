const eligible = require('./eligibility');
test('above the minimum qualifies', () => {
  expect(eligible(120,100)).toBe(true);
});

