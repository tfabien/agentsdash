// The menus of the bottom bar (theme, settings, device) open in place of the agents: one view at a time over the stage, which keeps
// its layout underneath. The same button, the Back tab on the left border (like the one of a full-screen session) or Escape closes the view.
// A view with pages of its own (the theme settings, the editor) hears 'viewback' on its node first and cancels it to go up one page.
import { el } from './dom.js';

/** @param {HTMLElement} stage the (positioned) element holding the agents */
export function createViewHost(stage) {
  const root = el('section', 'view');
  root.hidden = true;
  const head = el('div', 'vhead');
  const back = el('button', 'nav edge vback', '\u2039');
  back.setAttribute('aria-label', 'Back');
  back.title = 'Back (Esc)';
  const title = el('div', 'ttitle');
  const body = el('div', 'vbody');
  head.append(title);
  root.append(back, head, body);
  stage.append(root);
  let current = null;
  const entries = new Map();                                   // button -> entry

  function close() {
    if (!current) return;
    current.button.classList.remove('on');
    root.hidden = true;
    body.replaceChildren();
    current = null;
  }
  function open(entry) {
    current?.button.classList.remove('on');
    current = entry;
    title.textContent = entry.title;
    body.replaceChildren(entry.node);
    entry.button.classList.add('on');
    root.hidden = false;
    entry.onOpen?.();
  }
  /** One step back: the view's own page first (it cancels 'viewback'), else the agents. */
  function goBack() {
    if (!current) return;
    const ev = new Event('viewback', { cancelable: true });
    current.node.dispatchEvent(ev);
    if (!ev.defaultPrevented) close();
  }
  back.onclick = goBack;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) { e.preventDefault(); goBack(); } });     // preventDefault tells the page the key is used

  return {
    /** A click on `button` shows `node` under `title` (and runs `onOpen`), or closes it when it is already shown. */
    attach(button, title, node, onOpen) {
      const entry = { button, title, node, onOpen };
      entries.set(button, entry);
      button.onclick = () => (current === entry ? close() : open(entry));
    },
    close,
    /** Shows the view of `button` (the Back button of a preview returns to the theme list this way). */
    openFor(button) { const e = entries.get(button); if (e) open(e); },
    isOpen: () => current !== null,
  };
}
