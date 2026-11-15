// Phone page extras: keeps the screen on and offers full screen. The page's one event stream lives in hub_page.js, which sets
// body.offline while the hub is unreachable; phone.css shows the "hub unreachable" banner from that class.

// Screen Wake Lock: asked after the first touch (browsers require a gesture) and again when the page comes back to the front.
let lock = null;
async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || lock) return;
  try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { lock = null; }
}
addEventListener('pointerdown', keepAwake, { once: true });
document.addEventListener('visibilitychange', keepAwake);

// Full screen, like a dedicated device. The Fullscreen API works over plain http and needs a tap; an installed app or an iPhone home
// screen icon already runs without browser bars. A card explains both once; a corner button re-enters full screen afterwards.
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canFullscreen = !standalone && typeof document.documentElement.requestFullscreen === 'function';
const enterFullscreen = () => { if (canFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); };
const card = document.getElementById('onboard');
const fsButton = document.getElementById('fs-button');
const SEEN = 'agentsdash-phone-onboarded';
let seen = false;
try { seen = localStorage.getItem(SEEN) === '1'; } catch { /* private mode: the card shows every time */ }
document.getElementById('onboard-steps').textContent = ios
  ? 'To open it without bars: tap Share, then "Add to Home Screen". The new icon opens this page full screen.'
  : 'For a shortcut: open the browser menu (the three dots), then "Add to Home screen". The corner button hides the bars.';
let cardOpen = !standalone && !seen;
function render() {
  const full = Boolean(document.fullscreenElement);
  card.hidden = !cardOpen || full;
  fsButton.hidden = !canFullscreen || full || cardOpen;
}
const fullBtn = document.getElementById('onboard-full');
fullBtn.hidden = !canFullscreen;
fullBtn.onclick = () => { cardOpen = false; enterFullscreen(); render(); };
document.getElementById('onboard-ok').onclick = () => {
  cardOpen = false;
  try { localStorage.setItem(SEEN, '1'); } catch { /* the card comes back next time */ }
  render();
};
fsButton.onclick = enterFullscreen;
document.addEventListener('fullscreenchange', render);
render();

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
