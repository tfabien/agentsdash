// The QR button's panel: turns phone access on or off and shows the QR code that pairs a phone with the hub (docs/protocol.md, "LAN access").
import { qrSvg } from './qr.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const setLan = (enabled) => fetch('/lan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });

/** @returns {{node: HTMLElement, refresh: () => Promise<void>}} `refresh` asks the hub for the state and the pairing address again. Empty node on the phone page itself. */
export function createPhoneSection() {
  const node = el('div', 'vpanel sdevice sphone');
  if (document.documentElement.dataset.mode === 'phone') return { node: el('div'), refresh: async () => {} };

  /** A button in the style of the settings buttons; it runs `act`, then redraws the panel. */
  const button = (label, act) => {
    const row = el('div', 'sctl');
    const b = el('button', 'seg', label);
    b.onclick = async () => { b.disabled = true; try { await act(); } catch { /* the redraw shows the real state */ } refresh(); };
    row.append(b);
    return row;
  };

  async function refresh() {
    let info = { enabled: false, url: null };
    try { info = await (await fetch('/pair-info')).json(); } catch { /* the hub did not answer: shown as off */ }
    const body = [el('div', 'slabel', 'Pair a phone')];
    if (!info.enabled) {
      body.push(
        el('div', 'shint', 'Phone access is off: the hub only answers on this computer. Turning it on lets a phone on the same Wi-Fi read this page. It is read-only, protected by a token in the QR code, and uses plain http: use a network you trust.'),
        button('Turn on phone access', () => setLan(true)),
      );
    } else if (info.url) {
      const qr = el('div', 'sqr');
      qr.innerHTML = qrSvg(info.url);                   // markup built by qr.js from the module grid only, never from the address
      body.push(el('div', 'shint', 'Scan with the phone camera, on the same Wi-Fi.'), qr, el('code', 'surl', info.url), button('Turn off phone access', () => setLan(false)));
    } else {
      body.push(el('div', 'shint', 'Phone access is on, but this computer has no private network address. Connect to Wi-Fi, then open this panel again.'), button('Turn off phone access', () => setLan(false)));
    }
    node.replaceChildren(...body);
  }
  refresh();
  return { node, refresh };
}
