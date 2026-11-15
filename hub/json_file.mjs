// JSON files of the hub: one guarded read and two writes, shared by config.mjs, lan.mjs, market_install.mjs and hub.mjs.
import fs from 'node:fs';
import path from 'node:path';

/** The plain object stored in `file`; {} when the file is missing, unreadable, broken, or holds an array, null or a scalar. */
export function readJsonObject(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

const jsonText = (data, compact) => (compact ? JSON.stringify(data) : `${JSON.stringify(data, null, 2)}\n`);

/**
 * Writes `data` over `file` in place (2-space JSON plus a newline), creating its folder. For the user's config.json:
 * a rename would turn a symlinked config into a plain file, and on Windows it fails with EPERM while another program holds the file.
 * Throws on a write error.
 */
export function writeJsonFile(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, jsonText(data, false), 'utf8');
}

/**
 * Writes `data` to `<file>.tmp`, then renames it over `file`, creating the folder: a crash mid-write leaves the old file whole.
 * For the files the hub owns (market.json, market-cache.json, user themes). `compact` writes one line with no trailing newline.
 * Throws on a write or rename error, after removing the .tmp file.
 */
export function writeJsonAtomic(file, data, { compact = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  try {
    fs.writeFileSync(tmp, jsonText(data, compact), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}
