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
 * Fills `root` (a <footer>) with the bar. `onPreview(spec)`: the page shows a theme on made-up agents without saving it; `preview.show()` fills the bar for it. The theme, settings and device buttons open their menu inside `stage`, in place of the agents.
 * @returns {{update: (state: object, elapsedS: number) => void, settings: ReturnType<typeof createSettingsMenu>, views: ReturnType<typeof createViewHost>, themeButton: HTMLElement,
 *   preview: {show: (label: string, applyLabel: string, busyText: string, onApply: () => Promise<unknown>, onBack: () => void) => void, hide: (note?: string) => void}}}
 */
export function mountFooter(root, stage, { onPreview } = {}) {
  const quotas = el('span', 'quotas');
  const device = createDeviceMenu();
  const sound = el('button', 'chip sound');
  const gear = el('span', 'gearslot');
  const clock = el('span', 'clock');
  const settings = createSettingsMenu();
  const views = createViewHost(stage);
  const themes = createThemeMenu({ onPreview: (spec) => { views.close(); onPreview?.(spec); } });
  views.attach(themes.button, 'Theme', themes.panel, themes.onOpen);
  views.attach(settings.button, 'Settings', settings.panel);
  views.attach(device.button, 'Device', device.panel);
  gear.append(settings.button);
  const tools = el('span', 'tools');
  tools.append(sound, themes.button, device.button, gear);                   // icons close together; the clock stays apart
  const previewBar = el('span', 'previewbar');
  let noteTimer = null;
  previewBar.hidden = true;
  root.replaceChildren(previewBar, quotas, el('span', 'spacer'), tools, clock);
  let mode = 'ask';
  sound.onclick = () => postSettings({ sound: NEXT_SOUND[mode] ?? 'ask' });

  return {
    settings, views, themeButton: themes.button,
    preview: {
      /** The bar of a preview: Back, what is shown, and the apply button. While `onApply` runs the bar shows `busyText` with a spinner; a failure shows its reason. */
      show(label, applyLabel, busyText, onApply, onBack) {
        clearTimeout(noteTimer);
        const text = el('span', 'ptext', `Previewing ${label} on made-up agents`);
        const apply = el('button', 'chip', applyLabel);
        const back = el('button', 'chip', '← Back');
        back.onclick = onBack;
        apply.onclick = async () => {
          apply.disabled = true; back.disabled = true;
          text.className = 'ptext';
          text.textContent = busyText;
          previewBar.prepend(el('span', 'spin'));
          try { await onApply(); } catch (err) {
            previewBar.querySelector('.spin')?.remove();
            text.textContent = String(err.message ?? err); text.classList.add('err');
            apply.disabled = false; back.disabled = false;
          }
        };
        previewBar.replaceChildren(back, text, apply);
        previewBar.hidden = false;
        root.classList.add('previewing');
      },
      /** Closes the bar; with a `note` the bar stays 5 seconds with that message (the result of the apply). */
      hide(note) {
        clearTimeout(noteTimer);
        if (note) {
          previewBar.replaceChildren(el('span', 'ptext ok', `✔ ${note}`));
          previewBar.hidden = false;
          root.classList.add('previewing');
          noteTimer = setTimeout(() => { previewBar.hidden = true; root.classList.remove('previewing'); }, 5000);
          return;
        }
        previewBar.hidden = true; root.classList.remove('previewing');
      },
    },
    update(state, elapsedS) {
      mode = state.settings?.sound ?? 'ask';
      themes.update(state.settings?.theme, state.settings?.themeVariant, state.settings?.themeOverrides);
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
