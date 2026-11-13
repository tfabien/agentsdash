// The project is called agentsdash. The old name may stay only where it is a path or a config name that moves in step 2 of the split
// (docs/superpowers/specs/2026-11-13-multi-repo-split-and-rename-design.md): the user folder ~/.claude/standup-bot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHub } from '../hub.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OLD = /standup-bot|Agent standup|standup\.sessions/;
const ALLOWED = /\.claude\/standup-bot|'\.claude', 'standup-bot'/;       // the user folder, until step 2
const CODE = /\.(mjs|js|json|py|cpp|h|ino|html)$/;
const SKIP_DIR = new Set(['node_modules', '__pycache__', 'test', 'tests', '.git', 'fixtures']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

test('old_name_is_gone', () => {
  const files = [
    ...walk(path.join(ROOT, 'plugin')).filter((f) => CODE.test(f) || /[\\/]skills[\\/].*\.md$/.test(f)),
    ...walk(path.join(ROOT, '.claude-plugin')),
    ...walk(path.join(ROOT, 'devices')).filter((f) => CODE.test(f)),
  ];
  assert.ok(files.length > 50, `scanned ${files.length} files`);
  const hits = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (OLD.test(line) && !ALLOWED.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

test('saved_old_source_still_wins', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsdash-name-'));
  const settingsFile = path.join(dir, 'hub-settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ marketSources: ['tfabien/standup-bot-themes'] }));
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir: dir, settingsFile });
  try {
    const state = await (await fetch(`http://127.0.0.1:${hub.port}/state`)).json();
    assert.deepEqual(state.settings.marketSources, ['tfabien/standup-bot-themes']);
  } finally { await hub.close(); }
});
