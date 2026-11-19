// A confirmation in the page's own look: a modal <dialog> in place of the browser's confirm() box. Escape, Cancel or a click outside the box
// answer no; the action button answers yes. Keys pressed in the box do not reach the page (paging arrows, Escape of an open view).
import { el } from './dom.js';

/**
 * Ask a yes/no question. `ok` names the action button (default "OK"); `danger` paints it red for a removal.
 * @returns {Promise<boolean>} true when the user picked the action.
 */
export function askConfirm(message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'confirm');
    const yes = el('button', `chip${danger ? ' danger' : ' on'}`, ok);
    const no = el('button', 'chip', cancel);
    const row = el('div', 'confirm-actions');
    row.append(no, yes);
    dialog.append(el('p', 'confirm-text', message), row);
    const finish = (answer) => { dialog.close(); dialog.remove(); resolve(answer); };   // answers at once: the 'close' event waits for the next task
    yes.onclick = () => finish(true);
    no.onclick = () => finish(false);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(false); });   // the backdrop belongs to the dialog element itself
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });     // Escape
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(dialog);
    dialog.showModal();
    yes.focus();
  });
}

/**
 * Ask for a short text (a free answer to a question). `max` caps the length.
 * @returns {Promise<string|null>} the trimmed text, or null on Cancel, Escape, a click outside or an empty text.
 */
export function askText(message, { ok = 'SEND', cancel = 'Cancel', max = 500, voice = false } = {}) {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'confirm');
    const input = el('textarea', 'confirm-input');
    input.maxLength = max;
    input.rows = 3;
    const yes = el('button', 'chip on', ok);
    const no = el('button', 'chip', cancel);
    const row = el('div', 'confirm-actions');
    const Rec = voice ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : null;   // browser speech recognition: the audio goes to the browser's service
    let rec = null;
    const note = el('p', 'confirm-note', '');
    if (Rec) {
      const mic = el('button', 'chip', 'Mic');
      mic.onclick = () => {
        if (rec) { rec.stop(); return; }
        rec = new Rec();
        rec.lang = navigator.language || 'en-US';
        rec.interimResults = false;
        rec.onresult = (ev) => { input.value = `${input.value} ${[...ev.results].map((r) => r[0].transcript).join(' ')}`.trim().slice(0, max); };
        rec.onerror = (ev) => { note.textContent = `Voice unavailable (${ev.error}).`; };
        rec.onend = () => { rec = null; mic.classList.remove('on'); };
        mic.classList.add('on');
        note.textContent = '';
        try { rec.start(); } catch { rec = null; mic.classList.remove('on'); }
      };
      row.append(mic);
    }
    row.append(no, yes);
    dialog.append(el('p', 'confirm-text', message), input, note, row);
    const finish = (value) => { rec?.abort(); dialog.close(); dialog.remove(); resolve(value); };
    yes.onclick = () => finish(input.value.trim() || null);
    no.onclick = () => finish(null);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(null); });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dialog.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(input.value.trim() || null); }
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
