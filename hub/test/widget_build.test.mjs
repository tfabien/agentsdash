import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { compileCommand } from '../../widget/build.mjs';

test('compile_command_windows_uses_framework_csc_and_winexe', () => {
  const c = compileCommand('win32', '/r', { WINDIR: 'C:\\Windows' });
  assert.ok(c.cmd.endsWith(path.join('Framework64', 'v4.0.30319', 'csc.exe')));
  assert.ok(c.args.includes('/target:winexe'));
  assert.ok(c.args.includes(`/out:${path.join('/r', 'widget', 'windows', 'bin', 'AgentsdashWidget.exe')}`));
  assert.ok(c.args.some((a) => a.startsWith('/r:') && a.endsWith('Microsoft.Web.WebView2.WinForms.dll')));
  assert.ok(c.args.includes(path.join('/r', 'widget', 'windows', 'AgentsdashWidget.cs')));
});

test('compile_command_macos_uses_swiftc_with_output_in_bin', () => {
  const c = compileCommand('darwin', '/r');
  assert.equal(c.cmd, 'swiftc');
  assert.deepEqual(c.args, [path.join('/r', 'widget', 'macos', 'AgentsdashWidget.swift'), '-o', path.join('/r', 'widget', 'macos', 'bin', 'AgentsdashWidget')]);
});

test('compile_command_linux_is_null', () => {
  assert.equal(compileCommand('linux', '/r'), null);
});
