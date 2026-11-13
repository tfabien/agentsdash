import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';
import { loadConfig } from '../config.mjs';
import { forDevice } from '../ascii.mjs';

const EV = { v: 2, session: 'abcd', project: 'proj', agent: 'lead', role: 'lead', evt: 'PreToolUse', state: 'working', cmd: 'Edit a.js', detail: '' };
const post = (hub, p, body, raw) => fetch(`http://127.0.0.1:${hub.port}${p}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ?? JSON.stringify(body),
});
const get = (hub, p) => fetch(`http://127.0.0.1:${hub.port}${p}`);

const tmpUserDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hubu-'));    // never read the real ~/.claude/standup-bot

async function withHub(fn, opts = {}) {
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir: tmpUserDir(), ...opts });
  try { await fn(hub); } finally { await hub.close(); }
}

test('post_event_then_get_state', () => withHub(async (hub) => {
  const r = await post(hub, '/event', EV);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  const st = await (await get(hub, '/state')).json();
  assert.equal(st.sessions[0].id, 'abcd');
  assert.equal(st.sessions[0].agents[0].cmd, 'Edit a.js');
  assert.equal(st.time, undefined, 'the page has no clock');
}));

test('bad_json_returns_400_text', () => withHub(async (hub) => {
  const r = await post(hub, '/event', null, '{not json');
  assert.equal(r.status, 400);
  assert.match(r.headers.get('content-type'), /text\/plain/);
  const r2 = await post(hub, '/event', { v: 2, session: 'abcd', agent: 'lead', state: 'sleeping' });
  assert.equal(r2.status, 400);
}));

test('missing_v_on_usage_returns_400', () => withHub(async (hub) => {
  assert.equal((await post(hub, '/usage', { h5_pct: 10 })).status, 400);
  assert.equal((await post(hub, '/usage', { v: 1, h5_pct: 10 })).status, 200);
  const st = await (await get(hub, '/state')).json();
  assert.equal(st.usage.h5_pct, 10);
}));

test('select_unknown_returns_404', () => withHub(async (hub) => {
  assert.equal((await post(hub, '/select', { session: 'nope', agent: 'lead' })).status, 404);
  await post(hub, '/event', EV);
  assert.equal((await post(hub, '/select', { session: 'abcd', agent: 'lead' })).status, 200);
  assert.equal((await (await get(hub, '/state')).json()).view.mode, 'manual');
}));

test('reset_clears', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  assert.equal((await post(hub, '/reset', {})).status, 200);
  assert.equal((await (await get(hub, '/state')).json()).sessions.length, 0);
}));

test('health_answers_ok', () => withHub(async (hub) => {
  assert.equal((await (await get(hub, '/health')).json()).ok, true);
}));

test('sse_sends_state_on_connect_and_on_change', () => withHub(async (hub) => {
  const ctrl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${hub.port}/events`, { signal: ctrl.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const next = async () => {
    for (;;) {
      const i = buf.indexOf('\n\n');
      if (i >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); return JSON.parse(msg.replace(/^data: /, '')); }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      buf += dec.decode(value);
    }
  };
  assert.equal((await next()).sessions.length, 0);
  await post(hub, '/event', EV);
  let st = await next();
  while (st.sessions.length === 0) st = await next();
  assert.equal(st.sessions[0].id, 'abcd');
  ctrl.abort();
}));

test('restart_then_next_event_repairs_state', async () => {
  const first = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir: tmpUserDir() });
  await post(first, '/event', EV);
  await first.close();
  await withHub(async (hub) => {
    assert.equal((await (await get(hub, '/state')).json()).sessions.length, 0);
    await post(hub, '/event', EV);
    assert.equal((await (await get(hub, '/state')).json()).sessions[0].id, 'abcd');
  });
});

test('non_ascii_cmd_does_not_crash', () => withHub(async (hub) => {
  const r = await post(hub, '/event', { ...EV, cmd: 'café 中文 😀' });
  assert.equal(r.status, 200);
  const st = await (await get(hub, '/state')).json();
  assert.equal(st.sessions[0].agents[0].cmd, 'café 中文 😀');
}));

test('oversized_body_returns_413', () => withHub(async (hub) => {
  const r = await post(hub, '/event', null, JSON.stringify({ ...EV, detail: 'x'.repeat(200000) }));
  assert.equal(r.status, 413);
}));

test('unknown_route_returns_404', () => withHub(async (hub) => {
  assert.equal((await get(hub, '/nope')).status, 404);
}));

test('second_hub_on_same_port_fails', async () => {
  const first = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir: tmpUserDir() });
  try {
    await assert.rejects(startHub({ port: first.port, config: { relay: { mode: 'none' }, quotas: false }, userDir: tmpUserDir() }), (e) => e.code === 'EADDRINUSE');
  } finally { await first.close(); }
});

test('quota_poll_result_reaches_state_and_taps', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ five_hour: { utilization: 33, resets_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString() } }) });
  const hub = await startHub({
    port: 0, config: { relay: { mode: 'none' }, quotas: true }, userDir: tmpUserDir(),
    quota: { fetchImpl, env: { CLAUDE_CODE_OAUTH_TOKEN: 'x' }, stateDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hubq-')), autostart: false },
  });
  try {
    const seen = [];
    hub.onUsage((b) => seen.push(b));
    await hub.quotas.pollOnce(Date.now() / 1000);                 // no session yet: nothing happens
    assert.equal((await (await get(hub, '/state')).json()).usage, undefined);
    await post(hub, '/event', EV);
    await hub.quotas.pollOnce(Date.now() / 1000);
    const st = await (await get(hub, '/state')).json();
    assert.equal(st.usage.h5_pct, 33);
    assert.equal(seen.length, 1);
  } finally { await hub.close(); }
});

test('no_cors_headers_so_other_web_pages_cannot_read_the_state', () => withHub(async (hub) => {
  for (const p of ['/state', '/health', '/relay', '/']) {
    assert.equal((await get(hub, p)).headers.get('access-control-allow-origin'), null, p);
  }
  const res = await fetch(`http://127.0.0.1:${hub.port}/events`);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  await res.body.cancel();
}));

test('cross_origin_post_is_rejected_and_same_origin_or_no_origin_is_accepted', () => withHub(async (hub) => {
  const withOrigin = (origin) => fetch(`http://127.0.0.1:${hub.port}/event`, { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(EV) });
  assert.equal((await withOrigin('http://evil.example')).status, 403);
  assert.equal((await withOrigin('null')).status, 403);
  assert.equal((await (await get(hub, '/state')).json()).sessions.length, 0, 'the rejected event changed nothing');
  assert.equal((await withOrigin(`http://127.0.0.1:${hub.port}`)).status, 200);
  assert.equal((await withOrigin(`http://localhost:${hub.port}`)).status, 200);
  assert.equal((await post(hub, '/event', EV)).status, 200);          // the plugin sends no Origin
}));

test('foreign_host_header_is_rejected_against_dns_rebinding', () => withHub(async (hub) => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: hub.port, path: '/state', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
}));

test('dismiss_route_hides_a_session_and_answers_404_for_an_unknown_one', () => withHub(async (hub) => {
  await post(hub, '/event', EV);
  assert.equal((await post(hub, '/dismiss', { session: 'nope' })).status, 404);
  assert.equal((await post(hub, '/dismiss', { session: 'abcd' })).status, 200);
  assert.equal((await (await get(hub, '/state')).json()).sessions.length, 0);
  assert.equal((await post(hub, '/dismiss', null, '{bad')).status, 400);
}));

test('settings_default_to_beeps_for_questions_only_and_are_shared_by_every_page', () => withHub(async (hub) => {
  assert.equal((await (await get(hub, '/state')).json()).settings.sound, 'ask');
  assert.equal((await post(hub, '/settings', { sound: 'off' })).status, 200);
  assert.equal((await (await get(hub, '/state')).json()).settings.sound, 'off');
  assert.equal((await post(hub, '/settings', { sound: 'loud' })).status, 400);
  assert.equal((await (await get(hub, '/state')).json()).settings.sound, 'off', 'a bad value changes nothing');
  const s0 = (await (await get(hub, '/state')).json()).settings;
  assert.deepEqual([s0.max_tiles, s0.pulse, s0.dim_idle, 'view' in s0], [0, true, true, false], 'Auto tiles per page by default, no view setting');
  assert.equal((await post(hub, '/settings', { view: 'hub', max_tiles: 8, pulse: false })).status, 200);
  const s1 = (await (await get(hub, '/state')).json()).settings;
  assert.deepEqual([s1.sound, s1.max_tiles, s1.pulse, s1.dim_idle, 'view' in s1], ['off', 8, false, true, false], 'a partial update keeps the rest; the old view setting is ignored');
  assert.equal((await post(hub, '/settings', { max_tiles: 99 })).status, 400, 'nothing valid in it');
  assert.equal((await post(hub, '/settings', { max_tiles: 1 })).status, 200, 'one tile per page is allowed');
  assert.equal((await post(hub, '/settings', { max_tiles: 0, pulse: 'no' })).status, 200, 'the valid part is kept');
  const s2 = (await (await get(hub, '/state')).json()).settings;
  assert.deepEqual([s2.max_tiles, s2.pulse], [0, false]);
}));

test('settings_accept_valid_rules_and_reject_invalid', () => withHub(async (hub) => {
  assert.deepEqual((await (await get(hub, '/state')).json()).settings.rules, []);
  const rules = [{ match: '/w/prod-*', badgeColor: '#ff0000' }];
  assert.equal((await post(hub, '/settings', { rules })).status, 200);
  assert.deepEqual((await (await get(hub, '/state')).json()).settings.rules, rules);
  assert.equal((await post(hub, '/settings', { rules: [{ match: '/w', badgeColor: 'red' }] })).status, 400);
  assert.equal((await post(hub, '/settings', { rules: [{ match: '/w', iconPack: 'Bad Pack' }] })).status, 400);
  assert.deepEqual((await (await get(hub, '/state')).json()).settings.rules, rules, 'a bad value changes nothing');
}));

test('cwd_is_not_sent_to_device_relays', () => {
  const body = forDevice('/event', { session: 'abcd', project: 'demo', cwd: 'C:/work/demo', cmd: 'x' });
  assert.equal('cwd' in body, false);
});

test('settings_are_kept_in_a_file_for_the_next_hub', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hubset-')), 'settings.json');
  const first = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, settingsFile: file, userDir: tmpUserDir() });
  await post(first, '/settings', { sound: 'all' });
  await first.close();
  const second = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, settingsFile: file, userDir: tmpUserDir() });
  try { assert.equal((await (await get(second, '/state')).json()).settings.sound, 'all'); } finally { await second.close(); }
});

test('hub_binds_loopback_only', () => withHub(async (hub) => {
  assert.equal(hub.host, '127.0.0.1');
}));

test('loadConfig_defaults_and_file_and_env', () => {
  const dflt = loadConfig(path.join(os.tmpdir(), 'no-such-agent-gadget.json'), {});
  assert.deepEqual(dflt, { host: '127.0.0.1:8765', relay: { mode: 'none' }, quotas: true, context_window: 1000000, max_sessions: 12 });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hubcfg-')), 'c.json');
  fs.writeFileSync(file, JSON.stringify({ host: '127.0.0.1:9000', relay: { mode: 'http', host: '192.168.1.100' }, quotas: false, context_window: 200000 }));
  const c = loadConfig(file, {});
  assert.equal(c.host, '127.0.0.1:9000');
  assert.deepEqual(c.relay, { mode: 'http', host: '192.168.1.100' });
  assert.equal(c.quotas, false);
  assert.equal(c.context_window, 200000);
  assert.equal(loadConfig(file, { CLAUDE_GADGET_MAX_SESSIONS: '7' }).max_sessions, 7);
  assert.equal(loadConfig(file, { CLAUDE_GADGET_MAX_SESSIONS: '99' }).max_sessions, 12);     // out of range: default
  assert.equal(loadConfig(file, { CLAUDE_GADGET_HOST: 'h:1', CLAUDE_GADGET_QUOTAS: '0' }).host, 'h:1');
  fs.writeFileSync(file, '{broken');
  assert.equal(loadConfig(file, {}).host, '127.0.0.1:8765');
});

// Catalog: temp built-in and user folders, so the tests never read the real ~/.claude/standup-bot.
function catalogDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'standup-cat-'));
  const builtinDir = path.join(root, 'b');
  const userDir = path.join(root, 'u');
  fs.mkdirSync(path.join(userDir, 'themes'), { recursive: true });
  fs.mkdirSync(path.join(userDir, 'icons', 'cats'), { recursive: true });
  fs.mkdirSync(builtinDir, { recursive: true });
  return { root, builtinDir, userDir };
}

test('state_has_catalog', async () => {
  const d = catalogDirs();
  fs.writeFileSync(path.join(d.userDir, 'themes', 'mine.json'), JSON.stringify({ name: 'mine', colors: { FRAME: '#112233' } }));
  fs.writeFileSync(path.join(d.userDir, 'icons', 'cats', 'lead.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await withHub(async (hub) => {
    const st = await (await get(hub, '/state')).json();
    assert.deepEqual(st.catalog.themes.map((t) => t.name), ['mine']);
    assert.equal(st.catalog.packs[0].name, 'cats');
    assert.equal(st.catalog.packs[0].roles.lead, '/icons/cats/lead.svg');
    assert.deepEqual(st.catalog.errors, []);
  }, { builtinDir: d.builtinDir, userDir: d.userDir });
});

test('reload_picks_up_a_new_theme_file', async () => {
  const d = catalogDirs();
  await withHub(async (hub) => {
    assert.equal((await (await get(hub, '/state')).json()).catalog.themes.length, 0);
    fs.writeFileSync(path.join(d.userDir, 'themes', 'late.json'), JSON.stringify({ name: 'late', colors: { FRAME: '#112233' } }));
    const r = await fetch(`http://127.0.0.1:${hub.port}/reload`, { method: 'POST' });
    assert.equal(r.status, 200);
    assert.deepEqual((await (await get(hub, '/state')).json()).catalog.themes.map((t) => t.name), ['late']);
  }, { builtinDir: d.builtinDir, userDir: d.userDir });
});

test('svg_served_with_sandbox_csp_and_svg_mime', async () => {
  const d = catalogDirs();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>';
  fs.writeFileSync(path.join(d.userDir, 'icons', 'cats', 'lead.svg'), svg);
  await withHub(async (hub) => {
    const r = await get(hub, '/icons/cats/lead.svg');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/svg+xml');
    assert.equal(r.headers.get('content-security-policy'), 'sandbox');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.equal(await r.text(), svg);
    assert.equal((await get(hub, '/icons/cats/code.svg')).status, 404, 'unlisted file');
  }, { builtinDir: d.builtinDir, userDir: d.userDir });
});

test('icon_path_traversal_is_404', async () => {
  const d = catalogDirs();
  fs.writeFileSync(path.join(d.userDir, 'icons', 'cats', 'lead.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(d.userDir, 'secret.svg'), '<svg/>');
  await withHub(async (hub) => {
    for (const p of ['/icons/cats/../../secret.svg', '/icons/..%2Fsecret.svg', '/icons/cats/%2e%2e/%2e%2e/secret.svg', '/icons/cats/lead.svg/..']) {
      const r = await fetch(`http://127.0.0.1:${hub.port}${p}`);
      assert.equal(r.status, 404, p);
    }
  }, { builtinDir: d.builtinDir, userDir: d.userDir });
});

test('reload_rejects_foreign_host_and_origin', () => withHub(async (hub) => {
  const status = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: hub.port, path: '/reload', method: 'POST', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(status, 403);
  const r = await fetch(`http://127.0.0.1:${hub.port}/reload`, { method: 'POST', headers: { Origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
}));

test('raster_icons_are_served_with_their_own_mime', async () => {
  const d = catalogDirs();
  for (const file of ['plan.png', 'test.gif', 'code.webp', 'review.jpg']) {
    fs.writeFileSync(path.join(d.userDir, 'icons', 'cats', file), 'x');
  }
  await withHub(async (hub) => {
    for (const [file, mime] of [['plan.png', 'image/png'], ['test.gif', 'image/gif'], ['code.webp', 'image/webp'], ['review.jpg', 'image/jpeg']]) {
      const r = await get(hub, `/icons/cats/${file}`);
      assert.equal(r.status, 200, file);
      assert.equal(r.headers.get('content-type'), mime, file);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    }
  }, { builtinDir: d.builtinDir, userDir: d.userDir });
});

// ---- marketplace ----
import { fakeGitHub } from './fake_github.mjs';

const DEFAULT_SOURCE = 'tfabien/standup-bot-themes';
const mt = (name, version = '1.0.0') => JSON.stringify({ name, label: name, description: `${name} look`, keywords: [name], version, colors: { FRAME: '#112233' } });
const market = (version = '1.0.0') => fakeGitHub({
  [DEFAULT_SOURCE]: { files: { 'cat/theme.json': mt('cat', version), 'cat/preview.png': 'p', 'cat/icons/lead.png': 'png' } },
  'o/r': { files: { 'dog/theme.json': mt('dog'), 'dog/icons/lead.png': 'png' } },
});
const postJson = (hub, p, body, headers = {}) => fetch(`http://127.0.0.1:${hub.port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('market_lists_the_default_source', async () => {
  const d = catalogDirs();
  await withHub(async (hub) => {
    const m = await (await get(hub, '/market')).json();
    assert.deepEqual(m.sources, [DEFAULT_SOURCE]);
    assert.deepEqual(m.errors, []);
    assert.equal(m.themes[0].name, 'cat');
    assert.equal(m.themes[0].installed, false);
    assert.equal(m.themes[0].files, undefined);
    assert.equal(m.autoUpdate, true);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: market() });
});

test('market_sources_can_be_added_and_removed', async () => {
  const d = catalogDirs();
  await withHub(async (hub) => {
    assert.equal((await postJson(hub, '/market/sources', { add: 'https://github.com/o/r' })).status, 200);
    assert.deepEqual((await (await get(hub, '/state')).json()).settings.marketSources, [DEFAULT_SOURCE, 'o/r']);
    assert.deepEqual((await (await get(hub, '/market')).json()).themes.map((t) => t.name), ['cat', 'dog']);
    assert.equal((await postJson(hub, '/market/sources', { remove: DEFAULT_SOURCE })).status, 200);
    assert.deepEqual((await (await get(hub, '/state')).json()).settings.marketSources, ['o/r']);
    assert.equal((await postJson(hub, '/market/sources', { add: 'not a repo' })).status, 400);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: market() });
});

test('market_install_then_remove_changes_the_catalog', async () => {
  const d = catalogDirs();
  await withHub(async (hub) => {
    assert.equal((await postJson(hub, '/market/install', { source: DEFAULT_SOURCE, name: 'ghost' })).status, 400);
    assert.equal((await postJson(hub, '/market/install', { source: 'x/y', name: 'cat' })).status, 400);
    assert.equal((await postJson(hub, '/market/install', { source: DEFAULT_SOURCE, name: 'cat' })).status, 200);
    const st = await (await get(hub, '/state')).json();
    assert.deepEqual(st.catalog.themes.map((t) => t.name), ['cat']);
    assert.equal(st.catalog.themes[0].iconPack, 'cat');
    assert.equal(st.catalog.themes[0].description, 'cat look');
    assert.deepEqual(st.catalog.packs.map((p) => p.name), ['cat']);
    assert.equal((await (await get(hub, '/market')).json()).themes[0].installed, true);
    assert.equal(st.settings.theme, 'cat', 'an installed theme is applied at once');
    assert.equal((await postJson(hub, '/market/remove', { name: 'cat' })).status, 200);
    const after = await (await get(hub, '/state')).json();
    assert.deepEqual(after.catalog.themes, []);
    assert.equal(after.settings.theme, 'default', 'deleting the active theme goes back to default');
    assert.equal((await postJson(hub, '/market/remove', { name: 'cat' })).status, 404);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: market() });
});

test('market_update_installs_a_newer_version_and_nothing_when_current', async () => {
  const d = catalogDirs();
  let version = '1.0.0';
  const proxy = (url, init) => market(version)(url, init);
  await withHub(async (hub) => {
    await postJson(hub, '/market/install', { source: DEFAULT_SOURCE, name: 'cat' });
    assert.deepEqual(await (await postJson(hub, '/market/update', {})).json(), { updated: [], errors: [] });
    version = '1.1.0';
    assert.deepEqual(await (await postJson(hub, '/market/update', {})).json(), { updated: ['cat'], errors: [] });
    assert.equal((await (await get(hub, '/state')).json()).catalog.themes[0].version, '1.1.0');
    const m = await (await get(hub, '/market')).json();
    assert.equal(m.themes[0].updatable, false);
    assert.ok(m.lastCheck > 0);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: proxy });
});

test('market_routes_refuse_a_foreign_origin', async () => {
  const d = catalogDirs();
  await withHub(async (hub) => {
    const r = await postJson(hub, '/market/install', { source: DEFAULT_SOURCE, name: 'cat' }, { Origin: 'http://evil.example' });
    assert.equal(r.status, 403);
    assert.deepEqual((await (await get(hub, '/state')).json()).catalog.themes, []);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: market() });
});

test('market_settings_are_validated', () => withHub(async (hub) => {
  assert.equal((await post(hub, '/settings', { themeAutoUpdate: false })).status, 200);
  assert.equal((await post(hub, '/settings', { themeAutoUpdate: 'yes' })).status, 400);
  assert.equal((await post(hub, '/settings', { marketSources: ['a/b', 'a/b'] })).status, 400);
  assert.equal((await post(hub, '/settings', { marketSources: ['a/b'] })).status, 200);
  const st = await (await get(hub, '/state')).json();
  assert.equal(st.settings.themeAutoUpdate, false);
  assert.deepEqual(st.settings.marketSources, ['a/b']);
}));

test('market_delete_covers_a_hand_made_theme_and_refuses_a_built_in_one', async () => {
  const d = catalogDirs();
  fs.mkdirSync(path.join(d.builtinDir, 'themes'), { recursive: true });
  fs.writeFileSync(path.join(d.builtinDir, 'themes', 'base.json'), JSON.stringify({ name: 'base', colors: {} }));
  fs.writeFileSync(path.join(d.userDir, 'themes', 'mine.json'), JSON.stringify({ name: 'mine', colors: {} }));
  await withHub(async (hub) => {
    assert.deepEqual((await (await get(hub, '/market')).json()).userThemes, ['mine']);
    assert.equal((await postJson(hub, '/market/remove', { name: 'base' })).status, 400);
    assert.equal((await postJson(hub, '/market/remove', { name: 'mine' })).status, 200);
    assert.deepEqual((await (await get(hub, '/state')).json()).catalog.themes.map((t) => t.name), ['base']);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: market() });
});

test('market_refresh_clears_the_listing_cache', async () => {
  const d = catalogDirs();
  const f = market();
  await withHub(async (hub) => {
    await get(hub, '/market'); await get(hub, '/market');
    const lists = () => f.calls.filter((u) => u.endsWith('/git/trees/main?recursive=1')).length;
    assert.equal(lists(), 1, 'the second GET came from the cache');
    assert.equal((await postJson(hub, '/market/refresh', {})).status, 200);
    await get(hub, '/market');
    assert.equal(lists(), 2);
    assert.ok(fs.existsSync(path.join(d.userDir, 'market-cache.json')));
    const m = await (await get(hub, '/market')).json();
    assert.ok(m.refreshedAt[DEFAULT_SOURCE] > 0);
  }, { builtinDir: d.builtinDir, userDir: d.userDir, fetch: f });
});
