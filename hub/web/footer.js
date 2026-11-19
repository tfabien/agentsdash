// The bottom bar of the page: plan quotas, the beeps button, the theme button, the QR button, the settings gear, the clock.
import { quotaBars } from './hub_view.js';
import { createSettingsMenu, postSettings } from './settings.js';
import { createPhoneSection } from './phone_section.js';
import { createThemeMenu } from './theme_dialog.js';
import { createViewHost } from './views.js';
import { icon } from './icons.js';
import { el, postJson } from './dom.js';


export const SOUND_ICON = { all: 'speaker', ask: 'bell', off: 'muted' };
const SOUND_LABEL = { all: 'all events', ask: 'questions only', off: 'off' };
const NEXT_SOUND = { all: 'ask', ask: 'off', off: 'all' };

/**
 * Fills `root` (a <footer>) with the bar. `onPreview(spec)`: the page shows a theme on made-up agents without saving it; `preview.show()` fills the bar for it. The theme, QR and settings buttons open their menu inside `stage`, in place of the agents.
 * @returns {{update: (state: object, elapsedS: number) => void, settings: ReturnType<typeof createSettingsMenu>, views: ReturnType<typeof createViewHost>, themeButton: HTMLElement,
 *   preview: {show: (label: string, applyLabel: string, busyText: string, onApply: () => Promise<unknown>, onBack: () => void) => void, hide: (note?: string) => void}}}
 */
export function mountFooter(root, stage, { onPreview } = {}) {
  const quotas = el('span', 'quotas');
  const phone = createPhoneSection();
  const qr = el('button', 'chip qrbtn');
  qr.append(icon('qr'));
  qr.title = 'Pair a phone (QR code)';
  qr.setAttribute('aria-label', 'Pair a phone');
  const sound = el('button', 'chip sound');
  const gear = el('span', 'gearslot');
  const clock = el('span', 'clock');
  const settings = createSettingsMenu();
  const views = createViewHost(stage);
  const themes = createThemeMenu({ onPreview: (spec) => { views.close(); onPreview?.(spec); } });
  views.attach(themes.button, 'Theme', themes.panel, themes.onOpen);
  views.attach(settings.button, 'Settings', settings.panel);
  views.attach(qr, 'Phone', phone.node, phone.refresh);
  gear.append(settings.button);
  const tools = el('span', 'tools');
  tools.append(sound, themes.button, qr, gear);           // icons close together; the clock stays apart
  const previewBar = el('span', 'previewbar');
  let noteTimer = null;
  previewBar.hidden = true;
  // One line offering the desktop shortcut that opens the dashboard (GET /shortcut says when): Create, Later (until the page reloads), Never.
  const shortcutBar = el('span', 'shortcutbar');
  const shortcutText = el('span', 'ptext', 'Add a desktop shortcut that opens this dashboard?');
  const shortcutCreate = el('button', 'chip', 'Create it');
  const shortcutLater = el('button', 'chip', 'Later');
  const shortcutNever = el('button', 'chip', 'Never');
  shortcutBar.append(shortcutText, shortcutCreate, shortcutLater, shortcutNever);
  shortcutBar.hidden = true;
  let shortcutDismissed = false;                                  // Later: not offered again until the page reloads
  const hideShortcut = () => { shortcutBar.hidden = true; root.classList.remove('offering'); };
  shortcutLater.onclick = () => { shortcutDismissed = true; hideShortcut(); };
  shortcutNever.onclick = () => { hideShortcut(); postSettings({ shortcut_prompt: 'never' }); };
  shortcutCreate.onclick = async () => {
    shortcutCreate.disabled = true;
    const r = await postJson('/shortcut').catch(() => null);
    if (r?.ok) { shortcutText.textContent = 'Shortcut created on the desktop.'; shortcutBar.querySelectorAll('button').forEach((b) => b.remove()); setTimeout(hideShortcut, 4000); return; }
    const body = await r?.json().catch(() => null);
    shortcutText.textContent = `Could not create the shortcut: ${body?.error ?? 'the hub did not answer'}`;
    shortcutText.classList.add('err');
    shortcutCreate.disabled = false;
  };
  root.replaceChildren(previewBar, shortcutBar, quotas, el('span', 'spacer'), tools, clock);
  let mode = 'ask';
  sound.onclick = () => postSettings({ sound: NEXT_SOUND[mode] ?? 'ask' });
  // GET /shortcut says whether to offer the desktop shortcut; an older hub without the route answers 404 and nothing is offered.
  const loadOffer = () => fetch('/shortcut').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((s) => {
    if (s?.offer && shortcutBar.hidden && !shortcutDismissed) { shortcutBar.hidden = false; root.classList.add('offering'); }
  });
  loadOffer();

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
      themes.update(state.settings?.theme, state.settings?.themeVariant, state.settings?.themeOverrides, state.settings?.themeLooks);
      settings.updateRelay(state.relay);
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
      clock.hidden = state.settings?.show_clock === false;
      clock.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    },
  };
}
