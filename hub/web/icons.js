// Line icons of the bottom bar, one style for all of them (24x24, 1.8 stroke, currentColor), so they take the color of the button like the gear.
const SVG = 'http://www.w3.org/2000/svg';
const PATHS = {
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.2"/><path d="M12 2v2.8M12 19.2V22M2 12h2.8M19.2 12H22M4.9 4.9l2 2M17.1 17.1l2 2M4.9 19.1l2-2M17.1 6.9l2-2"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.2 9.2a4 4 0 0 1 0 5.6M18.8 6.6a8 8 0 0 1 0 10.8"/>',
  muted: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  plug: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v5"/>',
  plugoff: '<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v5"/><path d="M3 3l18 18"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2s-.5-.7-.5-1.2c0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.6" cy="11" r="1" fill="currentColor"/><circle cx="10.2" cy="7.4" r="1" fill="currentColor"/><circle cx="14.6" cy="7.4" r="1" fill="currentColor"/><circle cx="17" cy="11" r="1" fill="currentColor"/>',
};

/** An <svg> element of the named icon; it is decorative (the button carries the label). */
export function icon(name) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ico');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = PATHS[name] ?? '';
  return s;
}
