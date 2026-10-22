// Agent-authored teaching contrast, not independent human manual work.
const eligible = require('./eligibility');
test.each([[120,100,true],[100,100,true],[99,100,false]])(
  'eligibility(%i,%i) is %s under the inclusive contract', (total,minimum,expected) => {
    expect(eligible(total,minimum)).toBe(expected);
  });
