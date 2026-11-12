// Beep rule shared by the full page and the hub page (same rule as the buzzer of the gadget). No DOM here.

/** {needs, turn}: agents that need you, agents that wait for your turn. */
export function countStates(sessions) {
  const all = sessions.flatMap((s) => s.agents);
  return { needs: all.filter((a) => a.state === 'needs_you').length, turn: all.filter((a) => a.state === 'your_turn').length };
}

/** Beeps to play when `now` follows `prev` (null on the first state): two when more agents need you, one when more wait for
 * your turn (mode "all" only), none when the sound is off. */
export function beepsFor(prev, now, sound) {
  if (!prev || sound === 'off') return 0;
  if (now.needs > prev.needs) return 2;
  if (now.turn > prev.turn && sound === 'all') return 1;
  return 0;
}

/** Plays `times` short beeps (Web Audio). Silent when no audio is available. */
export function beep(times) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.32);
      osc.stop(ctx.currentTime + i * 0.32 + 0.12);
    }
    setTimeout(() => ctx.close(), times * 400 + 200);
  } catch { /* no audio available */ }
}
