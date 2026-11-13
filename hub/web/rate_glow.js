// How hard a session burns tokens, as a level for the readout of its tile: 0 normal, 1 orange, 2 red. Pure: the settings and the state in, a level and a label out.

const tokLabel = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k/min` : `${Math.round(n)}/min`);

/**
 * @param session  a session of the state (`dot`, `rate: {tok_min}|null`)
 * @param settings `rate_alert_k`: 0 (off) or the thousands of tokens per minute where the readout turns orange; red from 3 times that
 * @returns {{level: 0|1|2, label: string}|null} null: no readout
 */
export function rateLevel(session, settings) {
  const k = settings?.rate_alert_k ?? 20;
  if (!k || !session || session.dot !== 'working' || !session.rate) return null;
  const tpm = session.rate.tok_min;
  return { level: tpm >= 3 * k * 1000 ? 2 : tpm >= k * 1000 ? 1 : 0, label: tokLabel(tpm) };
}
