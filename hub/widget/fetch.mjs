// The widget host is compiled in CI and attached to the release of the core (agentsdash-widget-<os>-<version>.tar.gz + .sha256).
// A hub without a local build downloads it on the first click of the widget button, checks the hash, and unpacks it into
// <home>/widget/<core version>/. A newer core asks for its own version, so an update comes with the next session; older folders are removed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const REPO = 'tfabien/agentsdash';
const NAME = { win32: ['win', 'AgentsdashWidget.exe'], darwin: ['mac', 'AgentsdashWidget'] };

/** The release asset of a platform and core version, or null when the platform has no host. */
export function assetName(platform, version) {
  const n = NAME[platform];
  return n ? `agentsdash-widget-${n[0]}-${version}.tar.gz` : null;
}

/** Where the downloaded host of `version` lives, or null when the platform has no host. */
export function downloadedHostPath(platform, version, home) {
  const n = NAME[platform];
  return n ? path.join(home, 'widget', version, n[1]) : null;
}

const defaultExtract = (archive, dir) => {
  // relative names and cwd: GNU tar reads a drive letter (C:\...) as a remote host
  const r = spawnSync('tar', ['-xzf', path.basename(archive)], { cwd: dir, stdio: 'ignore' });
  if (r.status !== 0) throw new Error('tar could not unpack the widget');
};

/**
 * Makes sure the host of this core version is on disk.
 * @returns {Promise<string>} the path of the host; rejects with the reason (no release, hash mismatch, no network).
 */
export async function ensureHost({ platform = process.platform, version, home, repo = REPO, fetchFn = fetch, extract = defaultExtract }) {
  const file = assetName(platform, version), exe = downloadedHostPath(platform, version, home);
  if (!file || !version) throw new Error('unsupported platform or unknown version');
  if (fs.existsSync(exe)) return exe;
  const base = `https://github.com/${repo}/releases/download/v${version}/${file}`;
  const get = async (url) => {
    const res = await fetchFn(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`${url.split('/').pop()}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  const [data, sum] = await Promise.all([get(base), get(`${base}.sha256`)]);
  const want = sum.toString('utf8').trim().split(/\s+/)[0].toLowerCase();
  if (crypto.createHash('sha256').update(data).digest('hex') !== want) throw new Error('hash mismatch');
  const root = path.join(home, 'widget'), tmp = path.join(root, `${version}.tmp`), name = path.basename(exe);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const archive = path.join(tmp, file);
  fs.writeFileSync(archive, data);
  extract(archive, tmp);
  fs.rmSync(archive);
  if (!fs.existsSync(path.join(tmp, name))) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error('the archive has no host'); }
  if (platform !== 'win32') fs.chmodSync(path.join(tmp, name), 0o755);
  fs.renameSync(tmp, path.dirname(exe));
  for (const d of fs.readdirSync(root)) if (d !== version) fs.rmSync(path.join(root, d), { recursive: true, force: true });   // older versions
  return exe;
}
