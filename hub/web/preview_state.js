// Sessions for the theme preview: three made-up sessions (one with a team of sub-agents, one waiting for you, one failed) so a theme shows
// its eight roles and its states without touching the real sessions. Same shape as the sessions of the hub state (model.mjs toState).

const agent = (id, role, state, cmd, detail = '', age = 12) => ({
  tok: 18000, model: 'Sonnet 5.5', id, parent: role === 'lead' ? '' : 'lead', role, state, cmd, detail, prev: '', prev_age: 0, age,
});

const session = (id, project, title, dot, agents, extra = {}) => ({
  id, project, cwd: '', dot, count: agents.length, more: 0, title, ctx_pct: 38, ctx_k: 76, ctx_src: 'transcript', tok: 152000, plan: null, ask: null, agents, ...extra,
});

/** @returns {object[]} fresh session objects (ages are kept as given, the page adds the time since the preview started) */
export function previewSessions() {
  return [
    session('preview-1', 'demo-app', 'Add a theme marketplace', 'working', [
      agent('p1', 'lead', 'working', 'Edit theme_dialog.js', 'a card per theme'),
      agent('p2', 'explore', 'working', 'Grep marketplace', ''),
      agent('p3', 'plan', 'waiting_subs', 'Plan the install flow', ''),
      agent('p4', 'code', 'needs_you', 'Bash npm test', 'Allow this command?'),
      agent('p5', 'review', 'working', 'Read market_install.mjs', ''),
      agent('p6', 'test', 'done', 'Run 354 tests', ''),
    ], {
      plan: { done: 2, total: 5, cur: 'Write the page', next: 'Check in the browser', state: 'working', items: [
        { state: 'd', title: 'Read the code' }, { state: 'd', title: 'Write the hub routes' }, { state: 'r', title: 'Write the page' }, { state: 'p', title: 'Check in the browser' }, { state: 'p', title: 'Commit' },
      ] },
    }),
    session('preview-2', 'prod-api', 'Fix the invoice export', 'your_turn', [
      agent('q1', 'lead', 'your_turn', 'Done: the export is fixed', '', 140),
      agent('q2', 'general', 'done', 'Summarize the diff', '', 150),
    ]),
    session('preview-3', 'side-project', 'Migrate the database', 'error', [
      agent('r1', 'lead', 'error', 'Bash pytest', '2 tests failed', 30),
    ]),
  ];
}
