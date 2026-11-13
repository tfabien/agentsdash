// Per-project rules: pick an icon pack and badge color from a session's cwd.
// Plain ES module, no imports: runs in Node and in the browser.

const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function toRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // A pattern also matches its sub-folders.
  return new RegExp('^' + re + '(?:/.*)?$');
}

export function matchRule(rules, cwd) {
  if (!Array.isArray(rules) || typeof cwd !== 'string' || !cwd) return null;
  const path = norm(cwd);
  for (const r of rules) {
    if (!r || typeof r.match !== 'string' || !r.match) continue;
    if (toRegExp(norm(r.match)).test(path)) return r;
  }
  return null;
}

export function validRules(v) {
  if (!Array.isArray(v)) return false;
  return v.every((r) =>
    r && typeof r === 'object' && !Array.isArray(r) &&
    typeof r.match === 'string' && r.match.length > 0 &&
    (r.iconPack === undefined || (typeof r.iconPack === 'string' && /^[a-z0-9-]{1,32}$/.test(r.iconPack))) &&
    (r.badgeColor === undefined || (typeof r.badgeColor === 'string' && /^#[0-9a-f]{6}$/i.test(r.badgeColor))));
}
