import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assetName, downloadedHostPath, ensureHost } from '../widget/fetch.mjs';
import { widgetStatus, resolveHost } from '../widget/run.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wfetch-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
/** A fake release: the archive bytes and its hash; the extract stub drops the host next to the archive. */
const release = (archive, sum = sha(archive)) => (url) => Promise.resolve(url.endsWith('.sha256')
  ? { ok: true, arrayBuffer: async () => Buffer.from(`${sum}  x\n`) }
  : { ok: true, arrayBuffer: async () => archive });
const extract = (name) => (_a, dir) => fs.writeFileSync(path.join(dir, name), 'host');

test('asset_and_host_names_follow_the_release_contract', () => {
  assert.equal(assetName('win32', '0.9.1'), 'agentsdash-widget-win-0.9.1.tar.gz');
  assert.equal(assetName('darwin', '0.9.1'), 'agentsdash-widget-mac-0.9.1.tar.gz');
  assert.equal(assetName('linux', '0.9.1'), null);
  assert.equal(downloadedHostPath('win32', '0.9.1', 'H'), path.join('H', 'widget', '0.9.1', 'AgentsdashWidget.exe'));
});

test('ensure_host_downloads_checks_the_hash_and_drops_older_versions', async () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, 'widget', '0.8.0'), { recursive: true });
  const exe = await ensureHost({ platform: 'win32', version: '0.9.1', home, fetchFn: release(Buffer.from('zip')), extract: extract('AgentsdashWidget.exe') });
  assert.equal(fs.readFileSync(exe, 'utf8'), 'host');
  assert.deepEqual(fs.readdirSync(path.join(home, 'widget')), ['0.9.1'], 'the older version is gone');
  let calls = 0;
  assert.equal(await ensureHost({ platform: 'win32', version: '0.9.1', home, fetchFn: () => { calls++; }, extract }), exe);
  assert.equal(calls, 0, 'already on disk: no download');
});

test('ensure_host_refuses_a_bad_hash_and_a_missing_release', async () => {
  const home = tmp();
  await assert.rejects(ensureHost({ platform: 'win32', version: '0.9.1', home, fetchFn: release(Buffer.from('zip'), 'bad'), extract: extract('AgentsdashWidget.exe') }), /hash mismatch/);
  await assert.rejects(ensureHost({ platform: 'win32', version: '0.9.1', home, fetchFn: async () => ({ ok: false, status: 404 }) }), /HTTP 404/);
  assert.equal(fs.existsSync(path.join(home, 'widget', '0.9.1')), false, 'nothing half installed');
});

test('status_is_downloadable_until_a_host_is_on_disk_and_a_download_counts_as_built', async () => {
  const home = tmp(), root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"0.9.1"}');
  const env = { AGENTSDASH_HOME: home };
  assert.deepEqual(widgetStatus('win32', root, env), { supported: true, built: false, downloadable: true });
  assert.deepEqual(widgetStatus('linux', root, env), { supported: false, built: false, downloadable: false });
  await ensureHost({ platform: 'win32', version: '0.9.1', home, fetchFn: release(Buffer.from('z')), extract: extract('AgentsdashWidget.exe') });
  assert.equal(widgetStatus('win32', root, env).built, true);
  assert.equal(resolveHost('win32', root, env), path.join(home, 'widget', '0.9.1', 'AgentsdashWidget.exe'));
});
