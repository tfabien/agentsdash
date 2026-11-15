import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonObject, writeJsonFile, writeJsonAtomic } from '../json_file.mjs';
import { setLan } from '../lan.mjs';
import { startHub } from '../hub.mjs';
import { tmpUserDir } from './tmp_dirs.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jsonf-'));

test('readJsonObject_gives_an_empty_object_for_anything_but_a_plain_object', () => {
  const dir = tmp();
  assert.deepEqual(readJsonObject(path.join(dir, 'missing.json')), {});
  for (const text of ['[1]', '{oops', 'null', '42', '"text"', '']) {
    const f = path.join(dir, 'f.json');
    fs.writeFileSync(f, text);
    assert.deepEqual(readJsonObject(f), {}, JSON.stringify(text));
  }
  fs.writeFileSync(path.join(dir, 'ok.json'), '{"a":1,"b":{"c":[2]}}');
  assert.deepEqual(readJsonObject(path.join(dir, 'ok.json')), { a: 1, b: { c: [2] } });
});

test('writeJsonFile_writes_pretty_json_in_place_and_creates_the_folder', () => {
  const f = path.join(tmp(), 'a', 'b', 'config.json');
  writeJsonFile(f, { x: 1 });
  assert.equal(fs.readFileSync(f, 'utf8'), '{\n  "x": 1\n}\n');
});

test('writeJsonAtomic_round_trips_overwrites_and_leaves_no_tmp_file', () => {
  const dir = path.join(tmp(), 'new', 'folder');
  const f = path.join(dir, 'market.json');
  writeJsonAtomic(f, { a: 1 });
  assert.equal(fs.readFileSync(f, 'utf8'), '{\n  "a": 1\n}\n');
  writeJsonAtomic(f, { b: [1, 2] }, { compact: true });
  assert.equal(fs.readFileSync(f, 'utf8'), '{"b":[1,2]}');
  assert.deepEqual(fs.readdirSync(dir), ['market.json']);
});

test('writeJsonAtomic_keeps_the_old_file_and_no_tmp_when_the_rename_fails', () => {
  const dir = tmp();
  const f = path.join(dir, 'taken');
  fs.mkdirSync(path.join(f, 'inside'), { recursive: true });   // a non-empty folder under the file name: renameSync throws
  assert.throws(() => writeJsonAtomic(f, { a: 1 }));
  assert.deepEqual(fs.readdirSync(dir), ['taken']);
});

test('a_config_file_holding_an_array_is_replaced_by_an_object', async () => {
  const f = path.join(tmp(), 'config.json');
  fs.writeFileSync(f, '[1]');
  assert.equal(setLan(f, true), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { lan: { enabled: true } });

  fs.writeFileSync(f, '[1]');
  const hub = await startHub({ port: 0, userDir: tmpUserDir(), config: { relay: { mode: 'none' }, quotas: false }, configFile: f });
  try {
    const res = await fetch(`http://127.0.0.1:${hub.port}/relay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'none' }) });
    assert.equal(res.status, 200);
    assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { relay: { mode: 'none' } });
  } finally { await hub.close(); }
});
