// Opens the dashboard in its own window: an Edge or Chrome app window (no tabs, no address bar) on the hub page.
// Usage: node hub/dashboard/run.mjs. The hub opens it on POST /dashboard (launchApp). Contract: docs/dashboard-window.md.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig } from '../config.mjs';
import { configPath, homeDir } from '../paths.mjs';
import { isMain } from '../run_as_main.mjs';

export const dashboardUrl = (host) => `http://${host}/`;

const APP_BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

/** The first Edge or Chrome found at its usual install path, else undefined. */
export const findAppBrowser = () => APP_BROWSERS.find((p) => fs.existsSync(p));

/**
 * Opens the hub page in an app window. Windows snapping and PowerToys FancyZones act on it. The browser keeps its own profile folder
 * (`<home>/dashboard-app`), which remembers its size and position when the window is closed (no size is given on the command line: it would override the remembered one).
 * @returns {number} 0 started, 4 no Edge or Chrome found. Sets no process.exit (Windows libuv crash after a detached spawn).
 */
export function launchApp(url, env = process.env, spawnFn = spawn, browser = findAppBrowser(), platform = process.platform) {
  if (!browser) return 4;
  const profile = path.join(homeDir(env), 'dashboard-app');
  const args = [`--app=${new URL(url).href}`, '--no-first-run', `--user-data-dir=${profile}`,
    '--no-proxy-server',   // the page is on this machine: a proxy lookup behind a VPN made the first load take many seconds
    '--disable-sync', '--disable-background-networking', '--disable-extensions'];
  spawnFn(browser, args, { detached: true, stdio: 'ignore' }).unref();
  if (platform === 'win32') focusWindow(path.basename(browser, '.exe'), profile, spawnFn, path.join(homeDir(env), 'dashboard-focus.log'));
  return 0;
}

// Windows only, once the window exists (its exact title is the one of hub.html: the hub tab of the same browser is called "Agents Dash - <browser>"):
// - A process that does not own the foreground cannot show its window in front, the browser opens behind the others: the Alt key press lifts the
//   foreground lock and AppActivate brings the window forward.
// - Tools that place new windows (PowerToys FancyZones) and the browser itself ignore the placement the browser saved when the window was
//   closed (browser.app_window_placement in the profile's Preferences), so the window is put back there.
// The outcome goes to a log file, to see why when it does not work.
const focusScript = (name) => `
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName Microsoft.VisualBasic; Add-Type -AssemblyName System.Windows.Forms
Add-Type 'using System; using System.Runtime.InteropServices; public class DashWin { [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool repaint); }'
function Find-Placement($o) { if ($null -eq $o) { return $null }; if ($o.PSObject.Properties['left'] -and $o.PSObject.Properties['right']) { return $o }
  foreach ($p in $o.PSObject.Properties) { if ($p.Value -is [System.Management.Automation.PSCustomObject]) { $r = Find-Placement $p.Value; if ($r) { return $r } } } }
$end = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $end) {
  $w = Get-Process ${name} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Agents Dash' } | Select-Object -First 1
  if ($w) {
    [System.Windows.Forms.SendKeys]::SendWait('%'); [Microsoft.VisualBasic.Interaction]::AppActivate($w.Id)
    $placed = 'no saved placement'
    try {
      $prefs = Get-Content -Raw -Path (Join-Path $env:AD_PROFILE 'Default/Preferences') | ConvertFrom-Json
      $pl = Find-Placement $prefs.browser.app_window_placement
      if ($pl -and -not $pl.maximized) { [DashWin]::MoveWindow($w.MainWindowHandle, [int]$pl.left, [int]$pl.top, [int]($pl.right - $pl.left), [int]($pl.bottom - $pl.top), $true) | Out-Null; $placed = "placed at $($pl.left),$($pl.top) $($pl.right - $pl.left)x$($pl.bottom - $pl.top)" }
    } catch { $placed = "placement failed: $_" }
    'activated ' + $w.Id + ', ' + $placed; exit 0
  }
  Start-Sleep -Milliseconds 300
}
'no app window within 20 s'`;

function focusWindow(name, profile, spawnFn, logFile) {
  let out = '';
  const encoded = Buffer.from(focusScript(name), 'utf16le').toString('base64');   // no quoting of the script's own quotes on the command line
  const child = spawnFn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, AD_PROFILE: profile } });
  const log = (line) => { try { fs.writeFileSync(logFile, `${new Date().toISOString()} ${line}\n`); } catch { /* the log is a help only */ } };
  child.stdout?.on('data', (d) => { out += d; });
  child.stderr?.on('data', (d) => { out += d; });
  child.on?.('error', (e) => log(`spawn error: ${e.message}`));
  child.on?.('exit', (code) => log(`exit ${code}: ${out.trim()}`));
  child.unref?.();
}

/** @returns {number} exit code, see launchApp. */
export function main(env = process.env) {
  const code = launchApp(dashboardUrl(loadConfig(configPath(env), env).host), env);
  if (code === 4) console.error('No Edge or Chrome found at its usual install path: open the hub URL in a browser.');
  return code;
}

if (isMain(import.meta.url)) process.exitCode = main();
