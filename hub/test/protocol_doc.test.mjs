// The protocol documents must say what the code does: every route, every v2 event field and every device limit is listed,
// and a route named in a heading or a table row of docs/protocol.md must still exist in hub.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVICE_LIMITS } from '../ascii.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(HERE, ...p), 'utf8');
const protocol = read('..', '..', 'docs', 'protocol.md');
const deviceProtocol = read('..', '..', 'docs', 'device-protocol.md');

test('every_hub_route_is_documented', () => {
  const routes = [...read('..', 'hub.mjs').matchAll(/case '((?:GET|POST) \/[^']*)'/g)].map((m) => m[1]);
  assert.ok(routes.length >= 20, `found ${routes.length} routes in hub.mjs`);
  const missing = routes.filter((r) => !protocol.includes(r));
  assert.deepEqual(missing, [], 'routes of hub.mjs missing from docs/protocol.md');
});

test('every_documented_route_exists', () => {
  const code = new Set([...read('..', 'hub.mjs').matchAll(/case '((?:GET|POST) \/[^']*)'/g)].map((m) => m[1]));
  const documented = [
    ...protocol.matchAll(/^#{2,4} ((?:GET|POST) \/\S*)/gm),
    ...protocol.matchAll(/^\| ((?:GET|POST) \/\S*) \|/gm),
  ].map((m) => m[1]);
  assert.ok(documented.length >= 20, `found ${documented.length} documented routes`);
  const stale = documented.filter((r) => !code.has(r));
  assert.deepEqual(stale, [], 'routes of docs/protocol.md that hub.mjs no longer serves');
});

test('every_event_field_is_documented', () => {
  const src = read('..', 'model.mjs');
  const block = src.slice(src.indexOf('if (ev.v === 2) {'), src.indexOf('const name = clean(ev.agent)'));
  const fields = [...new Set([...block.matchAll(/\bev\.(\w+)/g)].map((m) => m[1]))].filter((f) => f !== 'v');
  assert.ok(fields.length >= 20, `found ${fields.length} event fields`);
  const missing = fields.filter((f) => !protocol.includes(`\`${f}\``));
  assert.deepEqual(missing, [], 'v2 event fields missing from docs/protocol.md');
});

test('device_limits_are_documented', () => {
  for (const [key, n] of Object.entries(DEVICE_LIMITS)) {
    assert.match(deviceProtocol, new RegExp(`\`${key}\`[^\\n]*\\b${n}\\b`), `${key} (${n}) missing from docs/device-protocol.md`);
  }
});
