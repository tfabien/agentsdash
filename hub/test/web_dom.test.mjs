// hub/web/dom.js: the one el() and the one JSON POST of the page modules (hub page and phone page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const dom = () => import('../web/dom.js');

/** Runs `fn` with globalThis.fetch replaced by a stub that records its calls and answers `status` with `text`. */
async function withFetch(status, text, fn) {
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (path, init) => { calls.push({ path, init }); return new Response(text, { status }); };
  try { await fn(calls); } finally { globalThis.fetch = saved; }
}

test('postJson_posts_json_and_omits_a_missing_body', async () => {
  const { postJson } = await dom();
  await withFetch(400, 'no', async (calls) => {
    const res = await postJson('/x', { a: 1 });
    assert.equal(res.status, 400);                       // postJson never throws: the caller reads the status
    await postJson('/y');
    assert.equal(calls[0].path, '/x');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.body, '{"a":1}');
    assert.equal(calls[1].init.body, undefined);
  });
});

test('call_sends_an_empty_object_by_default_and_throws_the_hub_reason', async () => {
  const { call } = await dom();
  await withFetch(200, 'ok', async (calls) => {
    const res = await call('/market/update');            // POST /market/update answers 400 on an empty body
    assert.equal(res.status, 200);
    assert.equal(calls[0].init.body, '{}');
  });
  await withFetch(400, 'invalid theme', async () => {
    await assert.rejects(call('/settings', { theme: 'x' }), { message: 'invalid theme' });
  });
});

test('one_el_and_one_json_post_in_hub_web', () => {
  const files = readdirSync(WEB).filter((f) => f.endsWith('.js'));
  const holding = (re) => files.filter((f) => re.test(readFileSync(join(WEB, f), 'utf8')));
  assert.deepEqual(holding(/const el = \(tag/), ['dom.js']);
  assert.deepEqual(holding(/'Content-Type': 'application\/json'/), ['dom.js']);
});

test('applying_a_previewed_theme_surfaces_a_refusal', () => {
  const src = readFileSync(join(WEB, 'hub_page.js'), 'utf8');
  assert.match(src, /if \(spec\.installed\) await call\('\/settings'/);   // postSettings resolves on a 400 and would show "Applied"
});
