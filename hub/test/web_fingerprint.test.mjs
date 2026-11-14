import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webFingerprint } from '../web_fingerprint.mjs';

test('fingerprint_changes_when_a_page_file_changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webfp-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'a.js'), 'one');
  fs.writeFileSync(path.join(dir, 'sub', 'b.css'), 'two');
  const first = webFingerprint(dir);
  assert.match(first, /^[0-9a-f]{12}$/);
  assert.equal(webFingerprint(dir), first);                   // same files, same value
  fs.writeFileSync(path.join(dir, 'sub', 'b.css'), 'two, longer');
  assert.notEqual(webFingerprint(dir), first);                // a file in a sub folder changed
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fingerprint_of_a_missing_folder_is_stable', () => {
  const gone = path.join(os.tmpdir(), 'webfp-missing-folder');
  assert.equal(webFingerprint(gone), webFingerprint(gone));
});

test('page_reloads_when_the_state_names_other_page_files', () => {
  const src = fs.readFileSync(new URL('../web/hub_page.js', import.meta.url), 'utf8');
  assert.match(src, /raw\.web !== webSeen\) \{ location\.reload\(\)/);
  const hub = fs.readFileSync(new URL('../hub.mjs', import.meta.url), 'utf8');
  assert.match(hub, /boot: startedAt, web,/);
});
