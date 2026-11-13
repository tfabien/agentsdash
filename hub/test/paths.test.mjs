import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { envVar, configPath, stateDir, migrateUserDir, userDir } from '../paths.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paths-'));
const put = (file, text = '{}') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

test('new_name_wins', () => {
  assert.equal(envVar('HOST', { AGENTSDASH_HOST: 'a', CLAUDE_GADGET_HOST: 'b' }), 'a');
  assert.equal(envVar('HOST', { CLAUDE_GADGET_HOST: 'b' }), 'b');
  assert.equal(envVar('HOST', { AGENTSDASH_HOST: '', CLAUDE_GADGET_HOST: 'b' }), 'b');
  assert.equal(envVar('HOST', {}), undefined);
});

test('config_path_order', () => {
  const home = tmp();
  const env = { AGENTSDASH_USER_HOME: home };
  const next = path.join(home, '.agentsdash', 'config.json');
  const legacy = path.join(home, '.claude', 'agent-gadget.json');
  assert.equal(configPath(env), next, 'neither file: the new path');
  put(legacy);
  assert.equal(configPath(env), legacy, 'only the legacy file');
  put(next);
  assert.equal(configPath(env), next, 'both: the new file');
  assert.equal(configPath({ ...env, AGENTSDASH_CONFIG: '/x/c.json' }), '/x/c.json');
  assert.equal(configPath({ ...env, CLAUDE_GADGET_CONFIG: '/y/c.json' }), '/y/c.json');
});

test('state_dir_default_and_override', () => {
  assert.equal(path.basename(stateDir({})), 'agentsdash');
  assert.equal(stateDir({ CLAUDE_GADGET_STATE_DIR: '/s' }), '/s');
  assert.equal(stateDir({ AGENTSDASH_STATE_DIR: '/n', CLAUDE_GADGET_STATE_DIR: '/s' }), '/n');
});

test('migrate_copies_once', () => {
  const home = tmp();
  const env = { AGENTSDASH_USER_HOME: home };
  put(path.join(home, '.claude', 'standup-bot', 'themes', 'a.json'), 'old-a');
  put(path.join(home, '.claude', 'standup-bot', 'themes', 'b.json'), 'old-b');
  put(path.join(userDir(env), 'themes', 'b.json'), 'mine');
  assert.equal(migrateUserDir(env), true);
  assert.equal(fs.readFileSync(path.join(userDir(env), 'themes', 'a.json'), 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(path.join(userDir(env), 'themes', 'b.json'), 'utf8'), 'mine', 'an existing file is kept');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'standup-bot', 'themes', 'a.json')), 'the old folder is left alone');
  put(path.join(userDir(env), 'themes', 'a.json'), 'edited');
  assert.equal(migrateUserDir(env), false);
  assert.equal(fs.readFileSync(path.join(userDir(env), 'themes', 'a.json'), 'utf8'), 'edited');
});

test('migrate_without_old_folder_does_nothing', () => {
  const home = tmp();
  assert.equal(migrateUserDir({ AGENTSDASH_USER_HOME: home }), false);
  assert.equal(fs.existsSync(path.join(home, '.agentsdash')), false);
});
