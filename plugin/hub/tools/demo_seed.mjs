// Demo data for the README screenshots of the real page: a hub in a temporary user folder, fed with made-up sessions through the public routes
// (POST /event, /usage, /settings, /reset, /market/install), so the page is the real one, not a drawing. One scene per feature to show.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';

const post = (hub, p, body) => fetch(`http://127.0.0.1:${hub.port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const lead = (session, project, over = {}) => ({ v: 2, session, agent: 'lead', role: 'lead', project, evt: 'PreToolUse', state: 'working', cmd: '', detail: '', ...over });
export const sub = (session, agent, role, project, over = {}) => ({ v: 2, session, agent, role, project, evt: 'PreToolUse', state: 'working', cmd: '', detail: '', ...over });

export const CHECKOUT = [
  lead('a1b2', 'checkout-api', { title: 'Add retry to the payment client', cwd: 'C:/work/checkout-api', cmd: 'Edit payment_client.py', model: 'Opus 5.5',
    tok: 182000, ctx_pct: 34, plan_done: 3, plan_total: 8, plan_cur: 'Write the failing tests', plan_next: 'Implement retry with backoff',
    plan_items: ['Read the client', 'Reproduce the timeout', 'Design the retry', 'Write the failing tests', 'Implement retry with backoff', 'Run the suite', 'Update the docs', 'Open the PR'], plan_state: 'working' }),
  sub('a1b2', 'e1', 'explore', 'checkout-api', { cmd: 'Grep "timeout" in src/', tok: 18000 }),
  sub('a1b2', 'e2', 'plan', 'checkout-api', { cmd: 'Read docs/specs/retry.md', tok: 9000 }),
  sub('a1b2', 'e3', 'test', 'checkout-api', { cmd: 'pytest tests/test_payment.py -x --maxfail=1 -k "retry or timeout"', tok: 41000 }),
  sub('a1b2', 'e4', 'review', 'checkout-api', { cmd: 'Bash(git diff main...HEAD)', tok: 12000 }),
];
const MORE_SUBS = [
  sub('a1b2', 'e5', 'code', 'checkout-api', { cmd: 'Edit retry.py', tok: 27000 }),
  sub('a1b2', 'e6', 'general', 'checkout-api', { cmd: 'WebFetch docs.stripe.com/error-handling', tok: 15000 }),
  sub('a1b2', 'e7', 'generic', 'checkout-api', { state: 'done', evt: 'SubagentStop', cmd: 'Changelog drafted', tok: 6000 }),
];
const BILLING = [
  lead('c3d4', 'prod-billing', { title: 'Fix the invoice rounding', cwd: 'C:/work/prod-billing', cmd: 'Read invoice.ts', model: 'Sonnet 5.5', tok: 64000, ctx_pct: 71,
    plan_done: 1, plan_total: 4, plan_cur: 'Find the rounding bug', plan_next: 'Add a regression test', plan_state: 'working' }),
  sub('c3d4', 'f1', 'code', 'prod-billing', { cmd: 'Edit invoice.ts', tok: 22000 }),
];
export const DOCS = lead('e5f6', 'docs-site', { title: 'Which API version should the docs target?', cwd: 'C:/work/docs-site', state: 'needs_you', evt: 'PermissionRequest', cmd: 'Question', model: 'Opus 5.5', tok: 30000, ctx_pct: 18,
  question: 'Which API version should the docs target?', options: 'v2 (current)|v3 (beta)|Both, behind a flag' });
export const MOBILE = lead('0718', 'mobile-app', { title: 'Migrate the login screen', cwd: 'C:/work/mobile-app', state: 'your_turn', evt: 'Stop', cmd: '', model: 'Sonnet 5.5', tok: 91000, ctx_pct: 52,
  reply_first: 'The login screen now uses the new auth hooks. Tests pass.', reply_last: 'Review the diff, then I can open the PR.' });
export const PIPELINE = lead('9a0b', 'data-pipeline', { title: 'Backfill the events table', cwd: 'C:/work/data-pipeline', state: 'error', evt: 'PostToolUseFailure', cmd: 'psql -f backfill.sql', model: 'Haiku 5.5', tok: 12000, ctx_pct: 9 });

/** Five more projects, so the hub has three pages of four tiles. */
const MORE_PROJECTS = [
  lead('b1c1', 'search-api', { title: 'Speed up the index rebuild', cwd: 'C:/work/search-api', cmd: 'Edit indexer.go', model: 'Sonnet 5.5', tok: 38000, ctx_pct: 27, plan_done: 2, plan_total: 5, plan_cur: 'Profile the rebuild', plan_next: 'Batch the writes', plan_state: 'working' }),
  lead('b2c2', 'ios-build', { title: 'Fix the signing step', cwd: 'C:/work/ios-build', cmd: 'xcodebuild -scheme App', model: 'Haiku 5.5', tok: 15000, ctx_pct: 12 }),
  lead('b3c3', 'analytics', { title: 'Weekly report query', cwd: 'C:/work/analytics', state: 'your_turn', evt: 'Stop', model: 'Sonnet 5.5', tok: 52000, ctx_pct: 33, reply_first: 'The query now runs in 4 s instead of 90 s.', reply_last: 'Check the new index before I merge it.' }),
  lead('b4c4', 'infra', { title: 'Rotate the staging certificates', cwd: 'C:/work/infra', cmd: 'terraform plan', model: 'Sonnet 5.5', tok: 47000, ctx_pct: 40 }),
  lead('b5c5', 'design-system', { title: 'Button variants', cwd: 'C:/work/design-system', cmd: 'Edit Button.tsx', model: 'Opus 5.5', tok: 61000, ctx_pct: 45, plan_done: 4, plan_total: 6, plan_cur: 'Update the stories', plan_next: 'Visual regression run', plan_state: 'working' }),
];

/** One scene per feature: the events to send and the hub settings (`max_tiles`: sessions the page shows at once, 0 is Auto). */
export const SCENES = {
  hub: { settings: { max_tiles: 4 }, events: [CHECKOUT[0], DOCS, MOBILE, PIPELINE, ...BILLING.slice(0, 1), ...MORE_PROJECTS] },   // 2x2 tiles, three pages
  tour: { settings: { max_tiles: 4 }, events: [MORE_PROJECTS[4], MORE_PROJECTS[3], MORE_PROJECTS[1], MORE_PROJECTS[0], BILLING[0], { ...PIPELINE, state: 'working', evt: 'PreToolUse' }, { ...DOCS, state: 'working', evt: 'PreToolUse', cmd: 'Read docs/api.md', question: '', options: '' }, { ...CHECKOUT[0], plan_done: 2, plan_cur: 'Reproduce the timeout', plan_next: 'Design the retry' }] },   // the starting point of the guided tour (page_gif.mjs): the hub lists the most recent session first, so checkout, docs, the pipeline and billing fill page 1 as a 2x2
  grid: { settings: { max_tiles: 4 }, events: [...CHECKOUT, DOCS, MOBILE, PIPELINE, ...BILLING] },    // 4 tiles, two more sessions on a second page
  plan: { settings: { max_tiles: 1 }, events: CHECKOUT },
  question: { settings: { max_tiles: 1 }, events: [DOCS] },
  subs3: { settings: { max_tiles: 1 }, events: [CHECKOUT[0], CHECKOUT[1], CHECKOUT[2], CHECKOUT[4]] },
  subs7: { settings: { max_tiles: 1 }, events: [...CHECKOUT, ...MORE_SUBS] },
  detail: { settings: { max_tiles: 1 }, events: CHECKOUT },
  empty: { settings: { max_tiles: 4 }, events: [] },
};

/** Clears the hub and plays one scene (sessions, usage, settings). */
export async function applyScene(hub, name) {
  const scene = SCENES[name];
  if (!scene) throw new Error(`unknown scene ${name}: ${Object.keys(SCENES).join(', ')}`);
  await post(hub, '/reset', {});
  for (const ev of scene.events) await post(hub, '/event', ev);
  await post(hub, '/usage', { v: 1, h5_pct: 48, h5_reset_s: 4800, d7_pct: 61, d7_reset_s: 183000 });
  await post(hub, '/settings', scene.settings);
}

/**
 * Starts a hub on a temporary user folder with two project rules. `themes` are installed from the marketplace (the last one is applied); without any, the built-in `theme` is applied.
 * @returns {Promise<{hub: object, userDir: string, close: () => Promise<void>}>}
 */
export async function startDemoHub({ themes = [], theme = 'line' } = {}) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'standup-demo-'));
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false, max_sessions: 12 }, userDir, settingsFile: path.join(userDir, 'hub-settings.json') });
  for (const name of themes) {
    const r = await post(hub, '/market/install', { source: 'tfabien/standup-bot-themes', name });
    if (r.status !== 200) throw new Error(`install ${name}: ${await r.text()}`);
  }
  if (!themes.length) await post(hub, '/settings', { theme });                        // the built-in example theme (variants, looks), no network
  await post(hub, '/settings', { rules: [{ match: 'C:/work/prod-*', badgeColor: '#e03131' }, { match: '**/docs-*', badgeColor: '#7048e8' }] });
  return { hub, userDir, close: async () => { await hub.close(); fs.rmSync(userDir, { recursive: true, force: true }); } };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const [scene = 'grid', ...themes] = process.argv.slice(2);
  const demo = await startDemoHub({ themes });
  await applyScene(demo.hub, scene);
  process.stdout.write(`demo hub on http://127.0.0.1:${demo.hub.port}/\n`);
}
