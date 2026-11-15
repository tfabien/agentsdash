// isMain(import.meta.url) tells an entry script it was started with `node <script>`, not imported.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from '../run_as_main.mjs';

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('is_main_matches_the_started_script_only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ismain-'));
  const file = path.join(dir, 'entry.mjs');
  fs.writeFileSync(file, '');
  const saved = process.argv[1];
  try {
    process.argv[1] = file;
    assert.equal(isMain(pathToFileURL(fs.realpathSync(file)).href), true);
    assert.equal(isMain(pathToFileURL(path.join(dir, 'other.mjs')).href), false);
    process.argv[1] = path.join(dir, 'missing.mjs');                // realpath throws: not main
    assert.equal(isMain(pathToFileURL(path.join(dir, 'missing.mjs')).href), false);
    process.argv[1] = undefined;
    assert.equal(isMain(pathToFileURL(file).href), false);
  } finally {
    process.argv[1] = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The tools once built `file:///` + argv[1], which gives four slashes on Linux and macOS: the tool did nothing and exited 0.
test('demo_seed_runs_when_started_by_its_absolute_path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-main-'));
  const env = { ...process.env, TMPDIR: root, TMP: root, TEMP: root, AGENTSDASH_HOME: path.join(root, 'home'),
    AGENTSDASH_STATE_DIR: path.join(root, 'state'), AGENTSDASH_USER_HOME: root };
  const child = spawn(process.execPath, [path.join(HUB, 'tools', 'demo_seed.mjs'), 'empty'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  try {
    const line = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no "demo hub on" line in 15 s: ${out}`)), 15000);
      child.stdout.on('data', () => { if (/demo hub on http:\/\/127\.0\.0\.1:\d+\//.test(out)) { clearTimeout(timer); resolve(out); } });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`demo_seed exited (${code}) without starting: ${out}`)); });
    });
    assert.match(line, /demo hub on/);
  } finally {
    child.kill();
    await new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', r)));
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the temp folder cleans it up */ }
  }
});
