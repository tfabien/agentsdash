// Phone page extras: keeps the screen on, shows "hub unreachable" and reloads once the hub is back.
import { nextDelay } from './reconnect.js';

const banner = document.getElementById('hub-down');

// Screen Wake Lock: asked after the first touch (browsers require a gesture) and again when the page comes back to the front.
let lock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || lock) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { lock = null; }
}
addEventListener('pointerdown', keepAwake, { once: true });
document.addEventListener('visibilitychange', keepAwake);

// Own watcher stream: the banner follows it; when it reopens after a drop the page reloads, so the tiles read a fresh state.
let delay = 0;
let wasDown = false;
function watch() {
  const es = new EventSource('/events');
  es.onopen = () => {
    delay = 0;
    banner.hidden = true;
    if (wasDown) location.reload();
  };
  es.onerror = () => {
    wasDown = true;
    banner.hidden = false;
    es.close();                                  // one retry loop of our own, whatever the browser would do
    delay = nextDelay(delay);
    setTimeout(watch, delay);
  };
}
watch();
