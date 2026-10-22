const { jest: base } = require('./package.json');
module.exports = { ...base, testMatch: ['**/test/defects/*.defects.js'] };

