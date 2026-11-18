// Launcher of the floating widget: starts the native host of this OS (widget/windows, widget/macos) on the hub page.
// Usage: node widget/run.mjs. Build the host once with node widget/build.mjs. Contract of the hosts: docs/widget.md.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../hub/config.mjs';
import { configPath, homeDir } from '../hub/paths.mjs';
import { readJsonObject } from '../hub/json_file.mjs';
import { isMain } from '../hub/run_as_main.mjs';

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
    alwaysOnTop: typeof d.alwaysOnTop === 'boolean' ? d.alwaysOnTop : DEFAULTS.alwaysOnTop,
  };
}

/** @returns {number} exit code: 0 started, 2 unsupported OS, 4 host not built. Sets no process.exit (Windows libuv crash after a detached spawn). */
export function main(argv, env = process.env, platform = process.platform, root = ROOT) {
  const exe = hostPath(platform, root);
  if (!exe) { console.error(`The widget supports Windows and macOS only (this is ${platform}).`); return 2; }
  if (!fs.existsSync(exe)) { console.error(`Widget host not built: run node widget/build.mjs first (${exe}).`); return 4; }
  const url = widgetUrl(loadConfig(configPath(env), env).host);
  const child = spawn(exe, buildArgs(url, path.join(homeDir(env), 'widget.json')), { detached: true, stdio: 'ignore' });
  child.unref();
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
