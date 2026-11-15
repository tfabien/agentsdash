import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findBrowser } from '../tools/browser.mjs';

test('find_browser_takes_the_path_in_screenshot_browser_first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-'));
  const exe = path.join(dir, 'my-browser');
  fs.writeFileSync(exe, '');
  const old = process.env.SCREENSHOT_BROWSER;
  try {
    process.env.SCREENSHOT_BROWSER = exe;
    assert.equal(findBrowser(), exe);
    process.env.SCREENSHOT_BROWSER = path.join(dir, 'missing');
    assert.notEqual(findBrowser(), path.join(dir, 'missing'));
  } finally {
    if (old === undefined) delete process.env.SCREENSHOT_BROWSER; else process.env.SCREENSHOT_BROWSER = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no_tool_imports_the_browser_helpers_from_another_script', () => {
  const tools = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
  for (const f of fs.readdirSync(tools).filter((n) => n.endsWith('.mjs'))) {
    const src = fs.readFileSync(path.join(tools, f), 'utf8');
    assert.doesNotMatch(src, /from '\.\/(screenshots|page_screenshots)\.mjs'/, f);
  }
});

test('every_tool_script_parses', () => {
  const tools = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools');
  for (const f of fs.readdirSync(tools).filter((n) => n.endsWith('.mjs'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(tools, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
