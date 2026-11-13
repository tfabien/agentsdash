// The core must run from a copy of its own folder: no sibling scripts/, no .claude-plugin/, nothing outside hub/.
// This is what the release tarball holds (see .github/workflows/release.yml).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['test', 'tools', 'node_modules', '__pycache__']);

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

test('core_boots_from_a_copy_of_its_folder', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
  const copy = path.join(root, 'core');
  fs.cpSync(HUB, copy, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
  assert.deepEqual(fs.readdirSync(root), ['core'], 'nothing next to the copy');
  const port = await freePort();
  const env = { ...process.env, AGENTSDASH_HOST: `127.0.0.1:${port}`, AGENTSDASH_HOME: path.join(root, 'home'), AGENTSDASH_STATE_DIR: path.join(root, 'state'), AGENTSDASH_USER_HOME: root };
  const child = spawn(process.execPath, [path.join(copy, 'hub.mjs')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  try {
    let health = null;
    for (const until = Date.now() + 8000; Date.now() < until && !health;) {
      try { health = await (await fetch(`http://127.0.0.1:${port}/health`)).json(); } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.ok(health, `the hub did not answer: ${stderr}`);
    const pkg = JSON.parse(fs.readFileSync(path.join(HUB, 'package.json'), 'utf8'));
    assert.equal(health.core, pkg.version);
    assert.equal(health.protocol, 2);
  } finally { child.kill(); }
});
