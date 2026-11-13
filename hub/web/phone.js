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

// Full screen, like a dedicated device: the first tap hides the browser bars (the Fullscreen API works over plain http; an installed
// app, or an iPhone home screen icon, already runs without bars). Leaving full screen brings the hint back.
const hint = document.getElementById('fs-hint');
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canFullscreen = !standalone && typeof document.documentElement.requestFullscreen === 'function';
const showHint = () => { hint.hidden = !canFullscreen || Boolean(document.fullscreenElement); };
document.addEventListener('fullscreenchange', showHint);
showHint();
addEventListener('click', () => {
  if (!canFullscreen || document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
});

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

// /phone?debug prints what the phone measures (the page has no developer console on a phone).
if (new URLSearchParams(location.search).has('debug')) {
  const pre = document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'page-debug' }));
  const grid = document.getElementById('tiles');
  setInterval(() => {
    const dims = (e) => `${e.clientWidth}x${e.clientHeight}`;
    pre.textContent = [
      `viewport ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} screen ${screen.width}x${screen.height}`,
      `grid ${dims(grid)} cols ${grid.style.getPropertyValue('--cols')} rows ${grid.style.getPropertyValue('--rows')}`,
      ...[...document.querySelectorAll('.tile')].map((t) => `tile ${dims(t)} canvas ${t.querySelector('canvas')?.style.width}x${t.querySelector('canvas')?.style.height} (${t.querySelector('canvas')?.width}x${t.querySelector('canvas')?.height})`),
    ].join('\n');
  }, 1000);
}
