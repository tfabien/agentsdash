// The bottom bar shared by the single page and the hub page: plan quotas, the beeps button, the theme button, the settings gear, the clock.
import { quotaBars } from './hub_view.js';
import { createSettingsMenu, postSettings } from './settings.js';
import { relayLabel } from './format.js';
import { createThemeDialog } from './theme_dialog.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export const SOUND_ICON = { all: '🔊', ask: '🔔', off: '🔇' };
const SOUND_LABEL = { all: 'all events', ask: 'questions only', off: 'off' };
const NEXT_SOUND = { all: 'ask', ask: 'off', off: 'all' };

/**
 * Fills `root` (a <footer>) with the bar.
 * @param {{page: 'hub'|'single'}} opts
 * @returns {{update: (state: object, elapsedS: number) => void, settings: ReturnType<typeof createSettingsMenu>}}
 */
export function mountFooter(root, { page }) {
  const quotas = el('span', 'quotas');
  const relay = el('span', 'relay', '\u{1F50C}');
  relay.hidden = true;
  const sound = el('button', 'chip sound');
  const gear = el('span', 'gearslot');
  const clock = el('span', 'clock');
  const settings = createSettingsMenu({ page });
  const themes = createThemeDialog();
  gear.append(settings.button);
  const tools = el('span', 'tools');
  tools.append(relay, sound, themes.button, gear);                    // icons close together; the clock stays apart
  root.replaceChildren(quotas, el('span', 'spacer'), tools, clock);
  let mode = 'ask';
  sound.onclick = () => postSettings({ sound: NEXT_SOUND[mode] ?? 'ask' });

  return {
    settings,
    update(state, elapsedS) {
      mode = state.settings?.sound ?? 'ask';
      themes.update(state.settings?.theme);
      settings.updateRelay(state.relay);
      const label = relayLabel(state.relay);              // a small plug: lit when the device answers, grey and crossed when it does not
      relay.hidden = !label;
      if (label) { relay.className = `relay ${label.ok ? 'ok' : 'down'}`; relay.title = `${label.text}. ${label.why}`; }
      sound.textContent = SOUND_ICON[mode] ?? SOUND_ICON.ask;
      sound.title = `Beeps: ${SOUND_LABEL[mode] ?? mode} (click to change)`;
      quotas.replaceChildren(...quotaBars(state.usage, elapsedS).map((q) => {
        const d = el('div', `quota ${q.stale ? 'stale' : q.level}`);
        const track = el('div', 'track'), fill = el('div', 'fill');
        fill.style.width = `${Math.min(100, q.pct)}%`;
        track.append(fill);
        const [pct, ...rest] = q.text.split(' ');
        d.append(el('span', '', q.label), track, el('b', '', pct), el('span', '', rest.join(' ')));
        return d;
      }));
      clock.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    },
  };
}
