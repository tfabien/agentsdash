// A confirmation in the page's own look: a modal <dialog> in place of the browser's confirm() box. Escape, Cancel or a click outside the box
// answer no; the action button answers yes. Keys pressed in the box do not reach the page (paging arrows, Escape of an open view).
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

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
