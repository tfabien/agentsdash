import test from 'node:test';
import assert from 'node:assert/strict';
import { listSource, parseSource } from '../market_source.mjs';

const RAW = 'https://raw.githubusercontent.com/o/r/main';
const themeJson = (name, extra = {}) => JSON.stringify({ name, label: name.toUpperCase(), description: `The ${name} theme`, keywords: [name], author: 'me', version: '1.2.0', colors: { FRAME: '#112233' }, ...extra });

/** A fake GitHub: `tree` entries are paths (a trailing / marks a tree), `raw` maps a path under the branch to its text. */
export function fakeGitHub({ tree, raw = {}, truncated = false, repoStatus = 200, treeStatus = 200, boom = null }) {
  return async (url) => {
    if (boom) throw new Error(boom);
    if (url === 'https://api.github.com/repos/o/r') return new Response(JSON.stringify({ default_branch: 'main' }), { status: repoStatus });
    if (url === 'https://api.github.com/repos/o/r/git/trees/main?recursive=1') {
      return new Response(JSON.stringify({ truncated, tree: tree.map((p) => ({ path: p.replace(/\/$/, ''), type: p.endsWith('/') ? 'tree' : 'blob', size: 10 })) }), { status: treeStatus });
    }
    if (url.startsWith(`${RAW}/`)) {
      const text = raw[url.slice(RAW.length + 1)];
      return text === undefined ? new Response('nope', { status: 404 }) : new Response(text, { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
}

test('lists_two_themes_with_metadata_files_and_preview', async () => {
  const f = fakeGitHub({
    tree: ['cat/', 'cat/theme.json', 'cat/preview.png', 'cat/icons/lead.png', 'dog/', 'dog/theme.json', 'dog/icons/lead.svg', 'README.md', 'docs/', 'docs/a.md'],
    raw: { 'cat/theme.json': themeJson('cat'), 'dog/theme.json': themeJson('dog') },
  });
  const r = await listSource('o/r', f);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.themes.map((t) => t.name), ['cat', 'dog']);
  const cat = r.themes[0];
  assert.equal(cat.source, 'o/r');
  assert.equal(cat.label, 'CAT');
  assert.equal(cat.description, 'The cat theme');
  assert.deepEqual(cat.keywords, ['cat']);
  assert.equal(cat.version, '1.2.0');
  assert.equal(cat.branch, 'main');
  assert.equal(cat.preview, `${RAW}/cat/preview.png`);
  assert.deepEqual([...cat.files].sort(), ['icons/lead.png', 'preview.png']);
  assert.equal(r.themes[1].preview, null);
});

test('a_folder_without_theme_json_is_ignored', async () => {
  const r = await listSource('o/r', fakeGitHub({ tree: ['x/', 'x/icons/lead.png'] }));
  assert.deepEqual(r, { themes: [], errors: [] });
});

test('a_folder_name_that_differs_from_the_theme_name_is_an_error', async () => {
  const r = await listSource('o/r', fakeGitHub({ tree: ['cat/', 'cat/theme.json'], raw: { 'cat/theme.json': themeJson('dog') } }));
  assert.deepEqual(r.themes, []);
  assert.match(r.errors[0], /cat.*dog/);
});

test('an_invalid_theme_json_is_an_error_and_the_others_still_list', async () => {
  const f = fakeGitHub({ tree: ['a/', 'a/theme.json', 'b/', 'b/theme.json'], raw: { 'a/theme.json': '{not json', 'b/theme.json': themeJson('b') } });
  const r = await listSource('o/r', f);
  assert.deepEqual(r.themes.map((t) => t.name), ['b']);
  assert.equal(r.errors.length, 1);
});

test('a_truncated_tree_is_an_error', async () => {
  const r = await listSource('o/r', fakeGitHub({ tree: ['a/'], truncated: true }));
  assert.deepEqual(r.themes, []);
  assert.match(r.errors[0], /truncated/);
});

test('http_errors_and_network_errors_give_one_error_line', async () => {
  for (const f of [fakeGitHub({ tree: [], repoStatus: 404 }), fakeGitHub({ tree: [], treeStatus: 403 }), fakeGitHub({ tree: [], boom: 'offline' })]) {
    const r = await listSource('o/r', f);
    assert.deepEqual(r.themes, []);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /^o\/r: /);
  }
});

test('unsafe_tree_paths_are_dropped_from_files', async () => {
  const f = fakeGitHub({ tree: ['cat/', 'cat/theme.json', 'cat/icons/lead.png', 'cat/icons/../evil.png', 'cat/icons\\bad.png'], raw: { 'cat/theme.json': themeJson('cat') } });
  const r = await listSource('o/r', f);
  assert.deepEqual(r.themes[0].files, ['icons/lead.png']);
});

test('parseSource_accepts_owner_repo_and_github_urls', () => {
  assert.equal(parseSource('a/b'), 'a/b');
  assert.equal(parseSource('https://github.com/a/b.git'), 'a/b');
  assert.equal(parseSource('https://github.com/a/b/'), 'a/b');
  assert.equal(parseSource('a/b/c'), null);
  assert.equal(parseSource('a b/c'), null);
  assert.equal(parseSource(''), null);
});
