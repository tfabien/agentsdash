import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, applyScene, startDemoHub } from '../tools/demo_seed.mjs';
import { SHOTS } from '../tools/page_screenshots.mjs';

// The README screenshots play these scenes: each one must reach the page with the sessions it was written for.
const WANT = {
  hub: { sessions: 10 }, tour: { sessions: 2 }, grid: { sessions: 5 }, empty: { sessions: 0 },
  plan: { sessions: 1, agents: 5 }, subs3: { sessions: 1, agents: 4 },
  subs7: { sessions: 1, agents: 8, done: 1 }, question: { sessions: 1, needsYou: 1, quest: 1 },
  permission: { sessions: 1, needsYou: 1, perm: 1 },
};

test('every_demo_scene_reaches_the_page_whole', async () => {
  const demo = await startDemoHub();
  try {
    assert.deepEqual(Object.keys(SCENES).sort(), Object.keys(WANT).sort());
    for (const [name, want] of Object.entries(WANT)) {
      await applyScene(demo.hub, name);
      const st = await (await fetch(`http://127.0.0.1:${demo.hub.port}/state`)).json();
      const agents = st.sessions.flatMap((s) => s.agents);
      assert.equal(st.sessions.length, want.sessions, `${name}: sessions`);
      if (want.agents) assert.equal(agents.length, want.agents, `${name}: agents`);
      if (want.done) assert.equal(agents.filter((a) => a.state === 'done').length, want.done, `${name}: done agents`);
      if (want.quest) assert.equal(st.sessions.filter((s) => s.quest).length, want.quest, `${name}: questions held for the page`);
      if (want.perm) assert.equal(st.sessions.filter((s) => s.perm).length, want.perm, `${name}: permissions held for the page`);
      if (want.needsYou) assert.equal(agents.filter((a) => a.state === 'needs_you').length, want.needsYou, `${name}: agents waiting for you`);
      assert.equal(st.settings.max_tiles, SCENES[name].settings.max_tiles, `${name}: max_tiles`);
    }
    await assert.rejects(applyScene(demo.hub, 'nope'), /unknown scene/);
  } finally { await demo.close(); }
});

test('every_page_screenshot_plays_a_demo_scene', () => {
  for (const [name, shot] of Object.entries(SHOTS)) assert.ok(shot.scene in SCENES, `${name}: scene ${shot.scene}`);
});
