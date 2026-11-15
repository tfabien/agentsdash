import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTokens, formatAge, fmtDuration, relayLabel, modelLabel } from '../web/format.js';
import { startHub } from '../hub.mjs';
import { tmpUserDir } from './tmp_dirs.mjs';
import { OPTIONS, portOptions } from '../web/settings.js';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';


test('format_helpers_match_firmware', () => {
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(12345), '12k');
  assert.equal(formatTokens(1600000), '1.6M');
  assert.equal(formatAge(12), '12s');
  assert.equal(formatAge(64), '1m04');
  assert.equal(formatAge(7500), '2h05m');
  assert.deepEqual([2700, 4800, 187000, -5].map(fmtDuration), ['45m', '1h20', '2d03h', '0m']);
});

test('relay_label_says_whether_the_gadget_is_reachable', () => {
  assert.equal(relayLabel(undefined), null);
  assert.equal(relayLabel({ mode: 'none' }), null);
  assert.deepEqual(relayLabel({ mode: 'serial', ok: false, connected: false, released: false, lastError: 'cannot open COM3' }), { text: 'USB not connected', ok: false, why: 'cannot open COM3' });
  assert.equal(relayLabel({ mode: 'serial', connected: false, released: true }).text, 'USB released');
  assert.equal(relayLabel({ mode: 'serial', connected: true }).text, 'USB connected');
  assert.deepEqual(relayLabel({ mode: 'http', ok: false, lastError: 'timeout' }), { text: 'gadget unreachable', ok: false, why: 'timeout' });
  assert.equal(relayLabel({ mode: 'http', ok: true }).text, 'gadget connected');
  assert.deepEqual([relayLabel({ mode: 'http', ok: true, locked: true }).text, relayLabel({ mode: 'http', ok: true, locked: true }).ok], ['screen upload lock', false]);
});

test('main_address_and_hub_alias_serve_the_one_page', async () => {
  const hub = await startHub({ port: 0, userDir: tmpUserDir(), config: { relay: { mode: 'none' }, quotas: false } });
  try {
    const base = `http://127.0.0.1:${hub.port}`;
    for (const p of ['/', '/hub', '/hub/']) {
      const res = await fetch(`${base}${p}`, { redirect: 'manual' });
      assert.equal(res.status, 200, p);
      const html = await res.text();
      assert.match(html, /<title>Agents Dash<\/title>/);
      assert.match(html, /hub_page\.js/);
      assert.match(html, /id="prev"/);                 // page arrows and dots
      assert.match(html, /id="back" class="nav edge"/);     // a full-screen session returns to the grid with a button like the page arrows
      assert.match(html, /id="pager"/);
      assert.match(html, /<footer id="bar"/);          // the quota bar exists once, at the bottom
    }
    const page = await (await fetch(`${base}/hub_page.js`)).text();
    assert.equal((page.match(/new EventSource\(/g) ?? []).length, 1);    // one stream for all tiles
    for (const f of ['hub_view.js', 'layout.js', 'alerts.js', 'hub.css', 'settings.js', 'settings.css', 'footer.js', 'screen.js', 'vector_screen.js', 'format.js', 'rate_glow.js']) assert.equal((await fetch(`${base}/${f}`)).status, 200, f);
    assert.equal((await fetch(`${base}/app.js`)).status, 404, 'the one-session page is gone');
    assert.equal((await fetch(`${base}/..%2fhub.mjs`)).status, 404);
  } finally { await hub.close(); }
});

test('every_stylesheet_in_web_is_linked_by_a_page', () => {
  const web = fileURLToPath(new URL('../web/', import.meta.url));
  const files = readdirSync(web);
  const html = files.filter((f) => f.endsWith('.html')).map((f) => readFileSync(join(web, f), 'utf8')).join('\n');
  for (const css of files.filter((f) => f.endsWith('.css'))) {
    assert.match(html, new RegExp(`<link[^>]+href="/?${css.replace('.', '\\.')}"`), `${css} is linked by no page`);
  }
});

test('settings_panel_offers_the_rate_glow_options', () => {
  const keys = OPTIONS.map((o) => o.key);
  assert.ok(keys.includes('rate_alert_k'));
});

test('model_label_reads_dated_ids', () => {
  assert.equal(modelLabel('claude-opus-4-20250514'), 'Opus 4');
  assert.equal(modelLabel('claude-sonnet-4-20250514'), 'Sonnet 4');
  assert.equal(modelLabel('claude-opus-4-1-20250805'), 'Opus 4.1');
  assert.equal(modelLabel('claude-opus-4-7[1m]'), 'Opus 4.7');
  assert.equal(modelLabel('claude-3-5-sonnet-20241022'), 'Sonnet 3.5');
  assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  assert.equal(modelLabel('gpt-5'), 'gpt-5');
});

test('port_options_label_the_listed_ports_and_keep_the_draft_port', () => {
  const ports = { ports: [{ path: 'COM3', label: 'CH340' }, { path: 'COM4' }] };
  assert.deepEqual(portOptions(ports, 'COM4'), [['COM3', 'COM3 (CH340)'], ['COM4', 'COM4']]);
  assert.deepEqual(portOptions(ports, 'COM9'), [['COM3', 'COM3 (CH340)'], ['COM4', 'COM4'], ['COM9', 'COM9']], 'a saved port that is not listed stays');
  assert.deepEqual(portOptions(null, ''), []);
});
