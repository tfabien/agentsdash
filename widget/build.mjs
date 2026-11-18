// Builds the native widget host of this OS into widget/<os>/bin/ (see docs/widget.md).
// Windows: csc.exe of .NET Framework 4 (in every Windows 10/11) plus the WebView2 managed DLLs fetched from NuGet.
// macOS: swiftc (Xcode Command Line Tools).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain } from '../hub/run_as_main.mjs';
import { hostPath } from './run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBVIEW2_VERSION = '1.0.4314.35';
const WEBVIEW2_SHA256 = '90778deb1b77e36292828b4b5833c9255c27533f40e0ddd55891ae718944edc4';
const NUPKG_URL = `https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${WEBVIEW2_VERSION}/microsoft.web.webview2.${WEBVIEW2_VERSION}.nupkg`;
// [file inside the package, file name next to the exe]
const WEBVIEW2_FILES = [
  ['lib/net462/Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.Core.dll'],
  ['lib/net462/Microsoft.Web.WebView2.WinForms.dll', 'Microsoft.Web.WebView2.WinForms.dll'],
  ['runtimes/win-x64/native/WebView2Loader.dll', 'WebView2Loader.dll'],
];

/** The compiler call for a platform, or null when the platform has no host. */
export function compileCommand(platform, root = ROOT, env = process.env) {
  const exe = hostPath(platform, root);
  if (platform === 'win32') {
    const bin = path.dirname(exe);
    return {
      cmd: path.join(env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      args: ['/nologo', '/target:winexe', '/platform:x64', `/out:${exe}`,
        '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
        `/r:${path.join(bin, 'Microsoft.Web.WebView2.Core.dll')}`, `/r:${path.join(bin, 'Microsoft.Web.WebView2.WinForms.dll')}`,
        path.join(root, 'widget', 'windows', 'AgentsdashWidget.cs')],
    };
  }
  if (platform === 'darwin') return { cmd: 'swiftc', args: [path.join(root, 'widget', 'macos', 'AgentsdashWidget.swift'), '-o', exe] };
  return null;
}

async function fetchWebView2(bin, env) {
  if (WEBVIEW2_FILES.every(([, name]) => fs.existsSync(path.join(bin, name)))) return;
  const res = await fetch(NUPKG_URL);
  if (!res.ok) throw new Error(`NuGet download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  if (hash !== WEBVIEW2_SHA256) throw new Error(`WebView2 package hash mismatch: ${hash}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webview2-'));
  try {
    fs.writeFileSync(path.join(tmp, 'pkg.nupkg'), buf);
    // bsdtar of Windows 10 1803+ reads zip files; a GNU tar earlier in PATH does not.
    const tar = path.join(env.WINDIR || 'C:\\Windows', 'System32', 'tar.exe');
    const r = spawnSync(tar, ['-xf', 'pkg.nupkg'], { cwd: tmp, stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Could not extract the WebView2 package');
    fs.mkdirSync(bin, { recursive: true });
    for (const [inside, name] of WEBVIEW2_FILES) fs.copyFileSync(path.join(tmp, inside), path.join(bin, name));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** @returns {Promise<number>} exit code: 0 built, 2 unsupported OS, 5 build failed. */
export async function main(argv = [], env = process.env, platform = process.platform, root = ROOT) {
  const c = compileCommand(platform, root, env);
  if (!c) { console.error(`The widget supports Windows and macOS only (this is ${platform}).`); return 2; }
  const exe = hostPath(platform, root);
  try {
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    if (platform === 'win32') await fetchWebView2(path.dirname(exe), env);
  } catch (e) { console.error(e.message); return 5; }
  const r = spawnSync(c.cmd, c.args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`Compilation failed (${c.cmd}, exit ${r.status ?? r.error?.message}).`); return 5; }
  console.log(`Built ${exe}`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
