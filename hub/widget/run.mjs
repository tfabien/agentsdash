// Launcher of the floating widget: starts the native host of this OS (widget/windows, widget/macos) on the hub page.
// Usage: node hub/widget/run.mjs. Build the host once with node hub/widget/build.mjs. Contract of the hosts: docs/widget.md.
// The hub page starts the widget through widgetStatus and launch (routes GET and POST /widget).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.mjs';
import { configPath, homeDir } from '../paths.mjs';
import { readJsonObject } from '../json_file.mjs';
import { isMain } from '../run_as_main.mjs';
import { downloadedHostPath, ensureHost } from './fetch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULTS = { x: null, y: null, width: 420, height: 300, opacity: 100, alwaysOnTop: true };
const OPACITIES = [100, 85, 70];

/** Path of the native host for a platform, or null when the platform has none. */
export function hostPath(platform, root = ROOT) {
  if (platform === 'win32') return path.join(root, 'widget', 'windows', 'bin', 'AgentsdashWidget.exe');
  if (platform === 'darwin') return path.join(root, 'widget', 'macos', 'bin', 'AgentsdashWidget');
  return null;
}

export const widgetUrl = (host) => `http://${host}/`;

/** Arguments are an array and never a shell string, so a path with spaces or accents stays one argument. */
export const buildArgs = (url, settingsFile) => ['--url', url, '--settings', settingsFile];

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Settings of the widget with a default for every missing or invalid field. Never throws. */
export function readSettings(file) {
  const d = readJsonObject(file);
  return {
    x: finite(d.x) ? d.x : DEFAULTS.x,
    y: finite(d.y) ? d.y : DEFAULTS.y,
    width: finite(d.width) && d.width >= 160 ? d.width : DEFAULTS.width,
    height: finite(d.height) && d.height >= 100 ? d.height : DEFAULTS.height,
    opacity: OPACITIES.includes(d.opacity) ? d.opacity : DEFAULTS.opacity,
    alwaysOnTop: typeof d.alwaysOnTop === 'boolean' || d.alwaysOnTop === 'auto' ? d.alwaysOnTop : DEFAULTS.alwaysOnTop,
  };
}

const coreVersion = (root = ROOT) => { try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? ''; } catch { return ''; } };

/** The host to run: the local build first, else the one downloaded for this core version; null when neither exists (or the OS has none). */
export function resolveHost(platform = process.platform, root = ROOT, env = process.env) {
  const local = hostPath(platform, root);
  if (local && fs.existsSync(local)) return local;
  const down = downloadedHostPath(platform, coreVersion(root), homeDir(env));
  return down && fs.existsSync(down) ? down : null;
}

/** What the page needs to know: can this OS run a widget, is a host on disk (built here or downloaded), else it is downloaded on the first click. */
export function widgetStatus(platform = process.platform, root = ROOT, env = process.env) {
  const supported = hostPath(platform, root) !== null;
  return { supported, built: supported && resolveHost(platform, root, env) !== null, downloadable: supported };
}

/** Downloads the host of this core version when no host is on disk. Rejects with the reason. */
export async function ensure(platform = process.platform, root = ROOT, env = process.env, fetchFn = fetch) {
  if (resolveHost(platform, root, env)) return;
  await ensureHost({ platform, version: coreVersion(root), home: homeDir(env), fetchFn });
}

/**
 * Starts the host on `url` (a second launch only brings the running window forward: the host is single-instance).
 * @returns {number} 0 started, 2 unsupported OS, 4 host not built. Sets no process.exit (Windows libuv crash after a detached spawn).
 */
export function launch(url, env = process.env, platform = process.platform, root = ROOT, spawnFn = spawn) {
  if (!hostPath(platform, root)) { console.error(`The widget supports Windows and macOS only (this is ${platform}).`); return 2; }
  const exe = resolveHost(platform, root, env);
  if (!exe) { console.error('Widget host not built: run node hub/widget/build.mjs first, or click the widget button to download it.'); return 4; }
  const page = new URL(url);
  page.searchParams.set('widget', '1');   // the page draws its compact bar for the widget (hub.html)
  spawnFn(exe, buildArgs(page.href, path.join(homeDir(env), 'widget.json')), { detached: true, stdio: 'ignore' }).unref();
  return 0;
}

/** @returns {number} exit code, see launch. */
export function main(argv, env = process.env, platform = process.platform, root = ROOT) {
  return launch(widgetUrl(loadConfig(configPath(env), env).host), env, platform, root);
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
