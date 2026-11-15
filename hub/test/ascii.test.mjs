import test from 'node:test';
import assert from 'node:assert/strict';
import { toAscii, asciiDeep } from '../ascii.mjs';

const noHighBytes = (s) => assert.ok(!/[^\x00-\x7F]/.test(s), `non-ASCII left in ${JSON.stringify(s)}`);

test('accents are stripped, precomposed and combining', () => {
  assert.equal(toAscii('Café déjà vu, garçon, Œuvre, Straße'), 'Cafe deja vu, garcon, OEuvre, Strasse');
  assert.equal(toAscii('é'), 'e');
});

test('typographic quotes, dashes and ellipsis map to ASCII', () => {
  assert.equal(toAscii('“it’s” – ok…'), '"it\'s" - ok...');
});

test('CJK and emoji become "?" per character, joiners are dropped', () => {
  assert.equal(toAscii('日本語'), '???');
  assert.equal(toAscii('ok \u{1F680}'), 'ok ?');
  assert.equal(toAscii('a‍b'), 'ab');
  noHighBytes(toAscii('漢字 \u{1F469}‍\u{1F4BB} é ’'));
});

test('plain ASCII is untouched', () => {
  assert.equal(toAscii('npm test -- --grep "x"\n'), 'npm test -- --grep "x"\n');
});

test('asciiDeep reduces nested strings and keeps other types', () => {
  const out = asciiDeep({ session: 'é', n: 3, ok: true, none: null, list: [{ t: '日本' }, 'ç'] });
  assert.deepEqual(out, { session: 'e', n: 3, ok: true, none: null, list: [{ t: '??' }, 'c'] });
});

test('forDevice cuts event fields to the firmware buffers and reduces to ASCII', async () => {
  const { forDevice } = await import('../ascii.mjs');
  const out = forDevice('/event', { session: 'abcdef', project: 'artillery-x3-screen', title: 'café '.repeat(20), cmd: 'x'.repeat(100), tok: 5 });
  assert.equal(out.session, 'abcd');
  assert.equal(out.project, 'artillery-x3-s');
  assert.equal(out.title.length, 30);
  assert.ok(out.title.startsWith('cafe cafe'));
  assert.equal(out.cmd.length, 63);
  assert.equal(out.tok, 5);
  assert.equal(forDevice('/usage', { note: 'x'.repeat(100) }).note.length, 100);
});

test('forDevice cuts the model id to the firmware buffer (MODEL_LEN 33)', async () => {
  const { forDevice } = await import('../ascii.mjs');
  assert.equal(forDevice('/event', { model: 'm'.repeat(50) }).model.length, 32);
});

test('a Stop at every limit fits the firmware serial line (JSON_LINE_MAX 1400) without the hub-only fields', async () => {
  const { forDevice, DEVICE_LIMITS } = await import('../ascii.mjs');
  const body = { v: 2, state: 'your_turn', tok: 123456, stok: 654321, ctx_pct: 42, ctx_k: 420, plan_done: 3, plan_total: 9 };
  for (const [key, n] of Object.entries(DEVICE_LIMITS)) body[key] = '"'.repeat(n + 5);    // each quote is 2 bytes once JSON-escaped
  delete body.question; delete body.options;                                                 // a Stop never carries a question
  Object.assign(body, {
    cwd: 'C:/work/'.repeat(40), plan_items: Array.from({ length: 30 }, (_, i) => `step ${i} `.repeat(10)),
    reply_first: '"x" '.repeat(75), reply_last: '…'.repeat(300), prompt: 'p'.repeat(300),
  });
  const out = forDevice('/event', body);
  for (const key of ['cwd', 'plan_items', 'reply_first', 'reply_last', 'prompt']) assert.equal(key in out, false, `${key} stays on the hub`);
  const line = `${JSON.stringify({ type: 'event', body: out })}\n`;
  assert.ok(Buffer.byteLength(line) <= 1400, `${Buffer.byteLength(line)} bytes`);
  assert.equal(out.state, 'your_turn');
});
