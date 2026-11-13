import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { win32 } from 'node:path';

const events = new Map([
  ['SessionStart', ['your_turn', 'Session opened']],
  ['UserPromptSubmit', ['working', 'Working']],
  ['Stop', ['your_turn', 'Your turn']],
  ['Interrupt', ['your_turn', 'Interrupted']],
  ['SessionEnd', ['done', 'Session closed']],
]);

async function forwardEvent() {
  const input = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  const { hook_event_name: event, session_id: id, cwd } = input ?? {};
  const status = events.get(event);
  if (!status || typeof id !== 'string' || !id) return;

  // The hub and its optional devices accept four-character session IDs.
  const session = createHash('sha256').update(`codex:${id}`).digest('hex').slice(0, 4);
  const folder = typeof cwd === 'string' ? win32.basename(cwd) : '';
  const [state, cmd] = status;

  // Forward status only. Hook inputs can also contain prompts and responses.
  await fetch('http://127.0.0.1:8765/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      v: 2, session, project: `Codex${folder ? ` ${folder}` : ''}`.slice(0, 14),
      agent: 'lead', role: 'lead', evt: event, state, cmd,
    }),
    signal: AbortSignal.timeout(600),
  });
}

// The dashboard is optional. A stopped hub must not block Codex.
await forwardEvent().catch(() => {});
