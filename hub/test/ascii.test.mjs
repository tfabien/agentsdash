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
