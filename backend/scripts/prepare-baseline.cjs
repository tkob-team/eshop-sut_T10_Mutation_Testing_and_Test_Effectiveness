// Materialize tracked configs for the frozen D04 test sets; no SUT production edits.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const write = (file,data) => fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const common=pkg.jest.projects[0];
common.testMatch=['<rootDir>/test/cart-orders.test.js','<rootDir>/test/coupons.test.js','<rootDir>/test/coupons-flow.test.js'];
Object.assign(pkg.scripts, {
  'test:cart-orders':'jest --selectProjects cart-coupons --runInBand --runTestsByPath test/cart-orders.test.js',
  'test:coupons':'jest --selectProjects cart-coupons --runInBand --runTestsByPath test/coupons.test.js test/coupons-flow.test.js',
  'mutate:coupons':'stryker run stryker.coupons.config.json',
  'mutate:auth':'stryker run stryker.auth.config.json',
  'tutorial:strong':'jest --config tutorial/jest.strong.config.cjs --runInBand',
  'tutorial:mutate:strong':'stryker run tutorial/stryker.strong.config.json',
});
write('package.json',pkg);
const scopes={coupons:['server.js:355-492'],'cart-orders':['server.js:280-349','server.js:510-568'],auth:['server.js:20-135']};
for(const [domain,mutate] of Object.entries(scopes)) {
  const config={ $schema:'./node_modules/@stryker-mutator/core/schema/stryker-schema.json',testRunner:'jest',coverageAnalysis:'perTest',mutate,tempDirName:'stryker-tmp',concurrency:2,timeoutMS:5000,timeoutFactor:1.5,reporters:['clear-text','html','json'],htmlReporter:{fileName:`reports/${domain}/mutation.html`},jsonReporter:{fileName:`reports/${domain}/mutation.json`} };
  if(domain==='auth') config.jest={configFile:'jest.auth.config.cjs'};
  else config.jest={config:{...common,testMatch:domain==='coupons'?['**/test/coupons.test.js','**/test/coupons-flow.test.js']:['**/test/cart-orders.test.js']}};
  write(`stryker.${domain}.config.json`,config);
}
