import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTokens, formatAge, fmtDuration, relayLabel } from '../web/format.js';
import { startHub } from '../hub.mjs';
import { OPTIONS } from '../web/settings.js';


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
});

test('main_address_and_hub_alias_serve_the_one_page', async () => {
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false } });
  try {
    const base = `http://127.0.0.1:${hub.port}`;
    for (const p of ['/', '/hub', '/hub/']) {
      const res = await fetch(`${base}${p}`, { redirect: 'manual' });
      assert.equal(res.status, 200, p);
      const html = await res.text();
      assert.match(html, /<title>Agents Dash<\/title>/);
      assert.match(html, /hub_page\.js/);
      assert.match(html, /id="prev"/);                 // page arrows and dots
      assert.match(html, /id="back" class="nav"/);     // a full-screen session returns to the grid with a button like the page arrows
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

test('settings_panel_offers_the_rate_glow_options', () => {
  const keys = OPTIONS.map((o) => o.key);
  assert.ok(keys.includes('rate_alert_k'));
});
