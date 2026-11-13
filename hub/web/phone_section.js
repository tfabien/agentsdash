// The "Phone" section of the Device panel: a QR code that pairs a phone with the hub (see docs/protocol.md, "LAN access").
import { qrSvg } from './qr.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** @returns {{node: HTMLElement, refresh: () => Promise<void>}} `refresh` asks the hub for the pairing address again. Empty node on the phone page itself. */
export function createPhoneSection() {
  const node = el('div', 'sdevice sphone');
  if (document.documentElement.dataset.mode === 'phone') return { node: el('div'), refresh: async () => {} };

  async function refresh() {
    let url = null;
    try { url = (await (await fetch('/pair-info')).json()).url; } catch { /* the hub did not answer: shown as off */ }
    const body = [el('div', 'slabel', 'Phone')];
    if (url) {
      const qr = el('div', 'sqr');
      qr.innerHTML = qrSvg(url);                        // markup built by qr.js from the module grid only, never from the address
      body.push(el('div', 'shint', 'Scan with the phone camera, on the same Wi-Fi.'), qr, el('code', 'surl', url));
    } else {
      body.push(el('div', 'shint', 'Phone access is off. Set "lan": { "enabled": true } in ~/.agentsdash/config.json, or start the hub with AGENTSDASH_LAN=1, then restart it.'));
    }
    node.replaceChildren(...body);
  }
  refresh();
  return { node, refresh };
}
