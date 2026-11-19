// Desktop shortcut that opens the dashboard: a .lnk on Windows, a .command on macOS, a .desktop on Linux.
// It runs ~/.agentsdash/open-dashboard.mjs (a copy of open.mjs, written here), which starts the hub if needed and opens the window.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homeDir } from '../paths.mjs';
import { renderIcon } from './icon.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'Agentsdash';

// Reads the paths from the environment: no quoting problem with spaces or accents in a user name.
const WINDOWS_SCRIPT = `
$d = [Environment]::GetFolderPath('Desktop'); $p = Join-Path $d '${NAME}.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($p)
$s.TargetPath = $env:AD_NODE; $s.Arguments = '"' + $env:AD_LAUNCHER + '"'; $s.WorkingDirectory = $env:AD_HOME
$s.WindowStyle = 7; $s.Description = 'Open the agentsdash dashboard'
if ($env:AD_ICON) { $s.IconLocation = $env:AD_ICON + ',0' }
$s.Save(); $p`;

/** The desktop folder of a platform (Linux: the XDG one when xdg-user-dir answers). */
export function desktopDir(platform = process.platform, env = process.env, run = spawnSync) {
  const homeFolder = env.HOME || env.USERPROFILE || os.homedir();
  if (platform === 'linux') {
    const r = run('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' });
    const dir = r?.status === 0 ? String(r.stdout).trim() : '';
    if (dir && dir !== homeFolder) return dir;
  }
  return path.join(homeFolder, 'Desktop');
}

/** Copies the launcher next to the user's files, so the shortcut survives core updates. @returns {string} its path */
export function installLauncher(env = process.env) {
  const dest = path.join(homeDir(env), 'open-dashboard.mjs');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(HERE, 'open.mjs'), dest);
  return dest;
}

/**
 * The dashboard icon next to the launcher (drawn by icon.mjs), as `dashboard.ico` on Windows (an ICO file may hold a PNG) and `dashboard.png` elsewhere. @returns {string} the path of the file written
 */
export function installIcon(platform = process.platform, env = process.env) {
  const png = renderIcon();
  const dir = homeDir(env);
  fs.mkdirSync(dir, { recursive: true });
  if (platform !== 'win32') {
    const dest = path.join(dir, 'dashboard.png');
    fs.writeFileSync(dest, png);
    return dest;
  }
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);            // type: icon
  head.writeUInt16LE(1, 4);            // one image
  // width and height bytes stay 0: 256 x 256
  head.writeUInt16LE(1, 10);           // planes
  head.writeUInt16LE(32, 12);          // bits per pixel
  head.writeUInt32LE(png.length, 14);  // size of the image data
  head.writeUInt32LE(22, 18);          // offset of the image data
  const dest = path.join(dir, 'dashboard.ico');
  fs.writeFileSync(dest, Buffer.concat([head, png]));
  return dest;
}

/** Updates the launcher copy when a shortcut already uses it, so it follows the routes of the running core. Never throws. */
export function refreshLauncher(env = process.env) {
  try { if (fs.existsSync(path.join(homeDir(env), 'open-dashboard.mjs'))) installLauncher(env); } catch { /* the copy stays as it is */ }
}

/**
 * Creates the shortcut on the desktop.
 * @returns {string} the file written. Throws an Error with the reason.
 */
export function createShortcut({ platform = process.platform, env = process.env, run = spawnSync, execPath = process.execPath } = {}) {
  const launcher = installLauncher(env);
  let icon = '';
  try { icon = installIcon(platform, env); } catch { /* a shortcut without its own icon still works */ }
  if (platform === 'win32') {
    // -EncodedCommand: the script's own quotes never go through the command line quoting.
    const r = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(WINDOWS_SCRIPT, 'utf16le').toString('base64')], {
      encoding: 'utf8', windowsHide: true,
      env: { ...env, AD_NODE: execPath, AD_LAUNCHER: launcher, AD_HOME: homeDir(env), AD_ICON: icon },
    });
    if (r.status !== 0) throw new Error(`could not create the shortcut: ${String(r.stderr || r.error?.message || '').trim()}`);
    return String(r.stdout).trim();
  }
  const dir = desktopDir(platform, env, run);
  fs.mkdirSync(dir, { recursive: true });
  if (platform === 'darwin') {
    const file = path.join(dir, `${NAME}.command`);
    fs.writeFileSync(file, `#!/bin/bash\nexec "${execPath}" "${launcher}"\n`, { mode: 0o755 });
    fs.chmodSync(file, 0o755);
    return file;
  }
  if (platform === 'linux') {
    const file = path.join(dir, `${NAME.toLowerCase()}.desktop`);
    fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=${NAME}\nComment=Open the agentsdash dashboard\nExec="${execPath}" "${launcher}"\n${icon ? `Icon=${icon}\n` : ''}Terminal=false\n`, { mode: 0o755 });
    fs.chmodSync(file, 0o755);
    return file;
  }
  throw new Error(`no desktop shortcut on ${platform}`);
}
