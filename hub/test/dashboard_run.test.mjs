import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardUrl, launchApp } from '../dashboard/run.mjs';

const fake = (calls) => (cmd, args, options) => { calls.push({ cmd, args, options }); return { unref() {} }; };

test('dashboard_url_from_host', () => {
  assert.equal(dashboardUrl('127.0.0.1:9000'), 'http://127.0.0.1:9000/');
});

test('launch_app_spawns_the_browser_in_app_mode_on_the_dashboard_page', () => {
  const calls = [];
  const code = launchApp('http://127.0.0.1:8765/', { AGENTSDASH_HOME: 'C:/h' }, fake(calls), 'C:/edge.exe', 'linux');
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'C:/edge.exe');
  assert.ok(calls[0].args.includes('--app=http://127.0.0.1:8765/'));
  assert.ok(calls[0].args.includes('--no-proxy-server'));
  assert.ok(!calls[0].args.some((a) => a.startsWith('--window-size')), 'the browser keeps the size of the last close');
  assert.equal(calls[0].options.detached, true);
});

test('launch_app_on_windows_also_starts_the_focus_helper', () => {
  const calls = [];
  launchApp('http://127.0.0.1:8765/', { AGENTSDASH_HOME: 'C:/h' }, fake(calls), 'C:/edge.exe', 'win32');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cmd, 'powershell.exe');
  assert.ok(Buffer.from(calls[1].args.at(-1), 'base64').toString('utf16le').includes('Get-Process edge'));
});

test('launch_app_returns_4_without_a_browser', () => {
  const never = () => { throw new Error('must not spawn'); };
  assert.equal(launchApp('http://127.0.0.1:8765/', {}, never, null), 4);
});
