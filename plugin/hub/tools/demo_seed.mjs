// Demo data for the README screenshots of the real page: a hub in a temporary user folder, fed with made-up sessions through the public routes
// (POST /event, /usage, /settings, /market/install), so the page is the real one, not a drawing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHub } from '../hub.mjs';

const post = (hub, p, body) => fetch(`http://127.0.0.1:${hub.port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const lead = (session, project, over = {}) => ({ v: 2, session, agent: 'lead', role: 'lead', project, evt: 'PreToolUse', state: 'working', cmd: '', detail: '', ...over });
const sub = (session, agent, role, project, over = {}) => ({ v: 2, session, agent, role, project, evt: 'PreToolUse', state: 'working', cmd: '', detail: '', ...over });

/** The made-up sessions, in the order they are sent. */
export const DEMO_EVENTS = [
  lead('a1b2', 'checkout-api', { title: 'Add retry to the payment client', cwd: 'C:/work/checkout-api', cmd: 'Edit payment_client.py', model: 'Opus 5.5',
    tok: 182000, ctx_pct: 34, plan_done: 3, plan_total: 8, plan_cur: 'Write the failing tests', plan_next: 'Implement retry with backoff',
    plan_items: ['Read the client', 'Reproduce the timeout', 'Design the retry', 'Write the failing tests', 'Implement retry with backoff', 'Run the suite', 'Update the docs', 'Open the PR'], plan_state: 'working' }),
  sub('a1b2', 'e1', 'explore', 'checkout-api', { cmd: 'Grep "timeout" in src/', tok: 18000 }),
  sub('a1b2', 'e2', 'plan', 'checkout-api', { cmd: 'Read docs/specs/retry.md', tok: 9000 }),
  sub('a1b2', 'e3', 'test', 'checkout-api', { cmd: 'pytest tests/test_payment.py -x', tok: 41000 }),
  sub('a1b2', 'e4', 'review', 'checkout-api', { state: 'needs_you', evt: 'PermissionRequest', cmd: 'Bash(git diff main...HEAD)', tok: 12000 }),
  lead('c3d4', 'prod-billing', { title: 'Fix the invoice rounding', cwd: 'C:/work/prod-billing', cmd: 'Read invoice.ts', model: 'Sonnet 5.5', tok: 64000, ctx_pct: 71,
    plan_done: 1, plan_total: 4, plan_cur: 'Find the rounding bug', plan_next: 'Add a regression test', plan_state: 'working' }),
  sub('c3d4', 'f1', 'code', 'prod-billing', { cmd: 'Edit invoice.ts', tok: 22000 }),
  lead('e5f6', 'docs-site', { title: 'Which API version should the docs target?', cwd: 'C:/work/docs-site', state: 'needs_you', evt: 'PermissionRequest', cmd: 'Question', model: 'Opus 5.5', tok: 30000, ctx_pct: 18,
    question: 'Which API version should the docs target?', options: 'v2 (current)|v3 (beta)|Both, behind a flag' }),
  lead('0718', 'mobile-app', { title: 'Migrate the login screen', cwd: 'C:/work/mobile-app', state: 'your_turn', evt: 'Stop', cmd: '', model: 'Sonnet 5.5', tok: 91000, ctx_pct: 52,
    reply_first: 'The login screen now uses the new auth hooks. Tests pass.', reply_last: 'Review the diff, then I can open the PR.' }),
  lead('9a0b', 'data-pipeline', { title: 'Backfill the events table', cwd: 'C:/work/data-pipeline', state: 'error', evt: 'PostToolUseFailure', cmd: 'psql -f backfill.sql', model: 'Haiku 5.5', tok: 12000, ctx_pct: 9 }),
];

/**
 * Starts a hub on a temporary user folder with the demo sessions, `themes` installed from the marketplace (the last one is applied) and usage numbers.
 * @returns {Promise<{hub: object, userDir: string, close: () => Promise<void>}>}
 */
export async function startDemoHub({ themes = [], settings = {} } = {}) {
  settings = { rules: [{ match: 'C:/work/prod-*', badgeColor: '#e03131' }, { match: '**/docs-*', badgeColor: '#7048e8' }], ...settings };
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'standup-demo-'));
  const hub = await startHub({ port: 0, config: { relay: { mode: 'none' }, quotas: false }, userDir, settingsFile: path.join(userDir, 'hub-settings.json') });
  for (const name of themes) {
    const r = await post(hub, '/market/install', { source: 'tfabien/standup-bot-themes', name });
    if (r.status !== 200) throw new Error(`install ${name}: ${await r.text()}`);
  }
  for (const ev of DEMO_EVENTS) await post(hub, '/event', ev);
  await post(hub, '/usage', { v: 1, h5_pct: 48, h5_reset_s: 4800, d7_pct: 61, d7_reset_s: 183000 });
  if (Object.keys(settings).length) await post(hub, '/settings', settings);
  return { hub, userDir, close: async () => { await hub.close(); fs.rmSync(userDir, { recursive: true, force: true }); } };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const themes = process.argv.slice(2);
  const demo = await startDemoHub({ themes });
  process.stdout.write(`demo hub on http://127.0.0.1:${demo.hub.port}/\n`);
}
