// How hard a session burns tokens, as a level for the glow of its tile: 0 green, 1 orange, 2 red. Pure: the settings and the state in, a level and a label out.

const tokLabel = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k/min` : `${Math.round(n)}/min`);

/**
 * @param session  a session of the state (`dot`, `rate: {tok_min}|null`)
 * @param usage    `state.usage` (`tok_per_pct`), may be absent
 * @param settings `rate_mode` ('off'|'tokens'|'quota'), `rate_orange_k`, `rate_red_k`, `rate_orange_pct`, `rate_red_pct`
 * @returns {{level: 0|1|2, label: string}|null} null: no glow, no readout
 */
export function rateLevel(session, usage, settings) {
  const mode = settings?.rate_mode ?? 'tokens';
  if (mode === 'off' || !session || session.dot !== 'working' || !session.rate) return null;
  const tpm = session.rate.tok_min;
  const perPct = usage?.tok_per_pct;
  const grade = (v, orange, red) => (v >= red ? 2 : v >= orange ? 1 : 0);
  if (mode === 'quota' && perPct > 0) {
    const pct = tpm / perPct;
    return { level: grade(pct, settings.rate_orange_pct ?? 0.5, settings.rate_red_pct ?? 1.5), label: `${pct.toFixed(1)}%/min` };
  }
  return { level: grade(tpm, (settings?.rate_orange_k ?? 20) * 1000, (settings?.rate_red_k ?? 60) * 1000), label: tokLabel(tpm) };
}
