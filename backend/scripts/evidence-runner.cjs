// Run the installed tool without a shell and keep immutable command/result evidence.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const backend = path.resolve(__dirname, '..');
const [destination, name, tool, ...args] = process.argv.slice(2);
if (!destination || !/^[\w-]+$/.test(name || '')) throw new Error('Usage: node scripts/evidence-runner.cjs ABS_DEST RUN_ID jest|stryker|node ...args');
if (!path.isAbsolute(destination)) throw new Error('Evidence destination must be absolute');
const bins = { jest: 'node_modules/jest/bin/jest.js', stryker: 'node_modules/@stryker-mutator/core/bin/stryker.js', node: null };
if (!(tool in bins)) throw new Error('Unsupported tool');
fs.mkdirSync(destination, { recursive: true });
const stem = path.join(destination, name);
if (fs.existsSync(stem + '.meta.json')) throw new Error('Refusing to overwrite run evidence: ' + stem);
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function inputs() {
  const found = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else found[path.relative(backend, file).replaceAll('\\', '/')] = hash(file);
    }
  }
  for (const dir of ['test', 'tutorial', 'scripts']) if (fs.existsSync(path.join(backend, dir))) walk(path.join(backend, dir));
  for (const file of fs.readdirSync(backend)) if (/^(server\.js|database\.js|database\.sqlite|package(-lock)?\.json)$|\.config\.(cjs|js|json)$/.test(file)) found[file] = hash(path.join(backend, file));
  return found;
}
const before = inputs();
const git = (...flags) => spawnSync('git', flags, { cwd: backend, encoding: 'utf8' }).stdout.trim();
const commandArgs = bins[tool] ? [path.join(backend, bins[tool]), ...args] : args;
const startedUtc = new Date().toISOString();
const started = performance.now();
const result = spawnSync(process.execPath, commandArgs, { cwd: backend, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, FORCE_COLOR: '0' } });
const after = inputs();
fs.writeFileSync(stem + '.log', '--- stdout ---\n' + (result.stdout || '') + '\n--- stderr ---\n' + (result.stderr || ''));
const meta = { name, executor: 'OpenAI Codex AI Agent; not a member self-run', startedUtc, finishedUtc: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started), executable: process.execPath, args: commandArgs, cwd: backend, node: process.version, platform: process.platform, arch: process.arch, commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), worktree: git('status', '--short'), exitCode: result.status, signal: result.signal, error: result.error?.message, inputSha256: before, changedInputs: Object.keys(before).filter(key => before[key] !== after[key]) };
fs.writeFileSync(stem + '.meta.json', JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify({ name, exitCode: result.status, elapsedMs: meta.elapsedMs, changedInputs: meta.changedInputs, log: stem + '.log' }));
process.exitCode = result.status === null ? 2 : result.status;
