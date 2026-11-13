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

test('docs_use_the_new_name', () => {
  const docs = ['README.md', 'INSTALL.md', 'CLAUDE.md', 'plugin/README.md', 'plugin/hub/README.md', 'docs/hub-themes.md', 'devices/README.md', 'devices/artillery-x3-esp32/README.md'];
  const allowed = /agent-gadget|CLAUDE_GADGET|\.claude\/standup-bot|formerly|renamed/i;
  const old = /standup-bot|agent standup|STANDUP_BOT/i;
  const hits = [];
  for (const d of docs) {
    fs.readFileSync(path.join(ROOT, d), 'utf8').split('\n').forEach((line, i) => { if (old.test(line) && !allowed.test(line)) hits.push(`${d}:${i + 1}`); });
  }
  assert.deepEqual(hits, []);
  for (const d of ['README.md', 'plugin/hub/README.md', 'devices/README.md']) {
    assert.match(fs.readFileSync(path.join(ROOT, d), 'utf8'), /protocol\.md/, `${d} links the protocol`);
  }
});

test('docs_new_config_names', () => {
  const read = (d) => fs.readFileSync(path.join(ROOT, d), 'utf8');
  for (const d of ['README.md', 'plugin/hub/README.md']) {
    assert.match(read(d), /~\/\.agentsdash\/config\.json/, `${d} names the new config file`);
    assert.match(read(d), /AGENTSDASH_HOST/, `${d} names the new variables`);
  }
  // The old names may appear only on a line that says they are the old ones.
  const OLD_NAMES = /CLAUDE_GADGET_|agent-gadget|\.claude\/standup-bot/;
  const SAYS_OLD = /\b(old|fallback|formerly|legacy|renamed)\b/i;
  const docs = ['README.md', 'INSTALL.md', 'CLAUDE.md', 'plugin/README.md', 'plugin/hub/README.md', 'docs/hub-themes.md', 'devices/README.md'];
  const hits = [];
  for (const d of docs) read(d).split('\n').forEach((line, i) => { if (OLD_NAMES.test(line) && !SAYS_OLD.test(line)) hits.push(`${d}:${i + 1}`); });
  assert.deepEqual(hits, []);
});

test('docs_core_install', () => {
  const read = (d) => fs.readFileSync(path.join(ROOT, d), 'utf8');
  for (const d of ['plugin/README.md', 'INSTALL.md']) assert.match(read(d), /~\/\.agentsdash\/core/, `${d} says where cores live`);
  assert.match(read('plugin/hub/README.md'), /-p<protocol>/, 'the release asset name');
  assert.match(read('docs/protocol.md'), /How an adapter picks a core/, 'the protocol says how a core is picked');
  assert.match(read('plugin/README.md'), /AGENTSDASH_CORE_DIR/);
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
