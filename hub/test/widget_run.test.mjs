import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hostPath, widgetUrl, buildArgs, readSettings, main, widgetStatus, launch } from '../widget/run.mjs';

const DEFAULTS = { x: null, y: null, width: 420, height: 300, opacity: 100, alwaysOnTop: true };
const tmpFile = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-'));
  const file = path.join(dir, 'widget.json');
  if (content !== undefined) fs.writeFileSync(file, content);
  return { dir, file };
};

test('host_path_per_platform', () => {
  assert.equal(hostPath('win32', '/r'), path.join('/r', 'widget', 'windows', 'bin', 'AgentsdashWidget.exe'));
  assert.equal(hostPath('darwin', '/r'), path.join('/r', 'widget', 'macos', 'bin', 'AgentsdashWidget'));
  assert.equal(hostPath('linux', '/r'), null);
});

test('widget_url_from_host', () => {
  assert.equal(widgetUrl('127.0.0.1:9000'), 'http://127.0.0.1:9000/');
});

test('build_args_keeps_spaces_and_accents', () => {
  const settings = 'C:/Users/Hélène Dupont/.agentsdash/widget.json';
  const args = buildArgs('http://127.0.0.1:8765/', settings);
  assert.deepEqual(args, ['--url', 'http://127.0.0.1:8765/', '--settings', settings]);
});

test('read_settings_defaults_on_missing_file', () => {
  const { dir, file } = tmpFile();
  try { assert.deepEqual(readSettings(file), DEFAULTS); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('read_settings_defaults_on_corrupt_json', () => {
  const { dir, file } = tmpFile('{not json');
  try { assert.deepEqual(readSettings(file), DEFAULTS); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('read_settings_keeps_valid_fields_and_resets_invalid', () => {
  const a = tmpFile('{"width": "wide", "opacity": 70, "x": 10, "y": -5, "alwaysOnTop": false}');
  const b = tmpFile('{"opacity": 50}');
  try {
    assert.deepEqual(readSettings(a.file), { ...DEFAULTS, opacity: 70, x: 10, y: -5, alwaysOnTop: false });
    assert.equal(readSettings(b.file).opacity, 100);
  } finally {
    fs.rmSync(a.dir, { recursive: true, force: true });
    fs.rmSync(b.dir, { recursive: true, force: true });
  }
});

test('read_settings_accepts_auto_always_on_top_and_rejects_other_strings', () => {
  const a = tmpFile('{"alwaysOnTop": "auto"}');
  const b = tmpFile('{"alwaysOnTop": "sometimes"}');
  try {
    assert.equal(readSettings(a.file).alwaysOnTop, 'auto');
    assert.equal(readSettings(b.file).alwaysOnTop, true);
  } finally {
    fs.rmSync(a.dir, { recursive: true, force: true });
    fs.rmSync(b.dir, { recursive: true, force: true });
  }
});

test('main_reports_unsupported_os_with_code_2', () => {
  assert.equal(main([], {}, 'linux'), 2);
});

test('main_reports_missing_host_with_code_4', () => {
  assert.equal(main([], { AGENTSDASH_HOME: path.join(os.tmpdir(), 'no-such-agentsdash-home') }, 'win32', path.join(os.tmpdir(), 'no-such-root')), 4);
});

// A root that holds a fake host file for a platform, so "built" can be tested without compiling.
const rootWithHost = (platform) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-root-'));
  const exe = hostPath(platform, root);
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  return { root, exe };
};

test('widget_status_unsupported_on_linux', () => {
  assert.deepEqual(widgetStatus('linux', '/r'), { supported: false, built: false });
});

test('widget_status_built_only_when_the_host_file_exists', () => {
  const { root } = rootWithHost('win32');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-root-'));
  try {
    assert.deepEqual(widgetStatus('win32', root), { supported: true, built: true });
    assert.deepEqual(widgetStatus('win32', empty), { supported: true, built: false });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('launch_spawns_detached_with_the_url_and_the_settings_file', () => {
  const { root, exe } = rootWithHost('win32');
  const calls = [];
  const fake = (file, args, options) => { calls.push({ file, args, options }); return { unref() {} }; };
  const home = path.join(os.tmpdir(), 'widget-home');
  try {
    assert.equal(launch('http://127.0.0.1:9000/', { AGENTSDASH_HOME: home }, 'win32', root, fake), 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, exe);
    // The page gets ?widget=1 so it can draw its compact bar.
    assert.deepEqual(calls[0].args, buildArgs('http://127.0.0.1:9000/?widget=1', path.join(home, 'widget.json')));
    assert.equal(calls[0].options.detached, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('launch_returns_4_when_not_built_and_2_when_unsupported', () => {
  const never = () => { throw new Error('must not spawn'); };
  assert.equal(launch('http://x/', {}, 'win32', path.join(os.tmpdir(), 'no-such-root'), never), 4);
  assert.equal(launch('http://x/', {}, 'linux', '/r', never), 2);
});
