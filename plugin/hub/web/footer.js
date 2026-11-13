// The bottom bar of the page: plan quotas, the beeps button, the theme button, the settings gear, the clock.
import { quotaBars } from './hub_view.js';
import { createSettingsMenu, createDeviceMenu, postSettings } from './settings.js';
import { createThemeMenu } from './theme_dialog.js';
import { createViewHost } from './views.js';
import { icon } from './icons.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export const SOUND_ICON = { all: 'speaker', ask: 'bell', off: 'muted' };
const SOUND_LABEL = { all: 'all events', ask: 'questions only', off: 'off' };
const NEXT_SOUND = { all: 'ask', ask: 'off', off: 'all' };

/**
 * Fills `root` (a <footer>) with the bar. The theme, settings and device buttons open their menu inside `stage`, in place of the agents.
 * @returns {{update: (state: object, elapsedS: number) => void, settings: ReturnType<typeof createSettingsMenu>, views: ReturnType<typeof createViewHost>}}
 */
export function mountFooter(root, stage) {
  const quotas = el('span', 'quotas');
  const device = createDeviceMenu();
  const sound = el('button', 'chip sound');
  const gear = el('span', 'gearslot');
  const clock = el('span', 'clock');
  const settings = createSettingsMenu();
  const themes = createThemeMenu();
  const views = createViewHost(stage);
  views.attach(themes.button, 'Theme', themes.panel, themes.onOpen);
  views.attach(settings.button, 'Settings', settings.panel);
  views.attach(device.button, 'Device', device.panel);
  gear.append(settings.button);
  const tools = el('span', 'tools');
  tools.append(sound, themes.button, device.button, gear);                   // icons close together; the clock stays apart
  root.replaceChildren(quotas, el('span', 'spacer'), tools, clock);
  let mode = 'ask';
  sound.onclick = () => postSettings({ sound: NEXT_SOUND[mode] ?? 'ask' });

  return {
    settings, views,
    update(state, elapsedS) {
      mode = state.settings?.sound ?? 'ask';
      themes.update(state.settings?.theme);
      device.updateRelay(state.relay);
      if (sound.dataset.mode !== mode) { sound.dataset.mode = mode; sound.replaceChildren(icon(SOUND_ICON[mode] ?? SOUND_ICON.ask)); }
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
