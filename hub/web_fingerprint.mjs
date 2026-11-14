// A short hash of the page's files (names, sizes, change times), taken once when the hub starts. The state carries it as `web`;
// an open page that sees a new value reloads itself, so it never keeps drawing with code older than the hub that serves it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function webFingerprint(dir) {
  const parts = [];
  const walk = (d, rel) => {
    let names;
    try { names = fs.readdirSync(d).sort(); } catch { return; }
    for (const name of names) {
      const full = path.join(d, name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full, `${rel}${name}/`);
      else parts.push(`${rel}${name}:${st.size}:${Math.round(st.mtimeMs)}`);
    }
  };
  walk(dir, '');
  return crypto.createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 12);
}
