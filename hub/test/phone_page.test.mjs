import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';
import { nextDelay } from '../web/reconnect.js';

test('nextDelay_doubles_up_to_ten_seconds', () => {
  assert.equal(nextDelay(0), 1000);
  assert.equal(nextDelay(1000), 2000);
  assert.equal(nextDelay(8000), 10000);
  assert.equal(nextDelay(10000), 10000);
});

async function withHub(fn) {
  const hub = await startHub({ port: 0, userDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hubp-')), config: { relay: { mode: 'none' }, quotas: false } });
  try { await fn((p) => fetch(`http://127.0.0.1:${hub.port}${p}`)); } finally { await hub.close(); }
}

test('phone_page_links_the_manifest', () => withHub(async (get) => {
  const r = await get('/phone');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(await r.text(), /rel="manifest"/);
}));

test('manifest_is_standalone_with_existing_icons', () => withHub(async (get) => {
  const r = await get('/manifest.webmanifest');
  assert.match(r.headers.get('content-type'), /manifest\+json/);
  const m = await r.json();
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/phone');
  assert.equal(m.icons.length, 2);
  for (const i of m.icons) {
    const ir = await get(i.src);
    assert.equal(ir.status, 200, i.src);
    assert.equal(ir.headers.get('content-type'), 'image/png');
  }
  assert.equal((await get('/phone-180.png')).status, 200);
}));

test('phone_assets_are_served', () => withHub(async (get) => {
  for (const f of ['/phone.js', '/phone.css', '/reconnect.js']) assert.equal((await get(f)).status, 200, f);
}));
