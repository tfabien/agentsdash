// A fake GitHub for the marketplace tests. `repos` maps `owner/repo` to { files: { 'cat/theme.json': text|Buffer, ... } } (branch main).
// Returns a fetch function with `.calls` (the URLs asked). A repository that is not listed answers 404.
export function fakeGitHub(repos) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const api = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)(\/git\/trees\/main\?recursive=1)?$/.exec(url);
    if (api) {
      const repo = repos[api[1]];
      if (!repo) return new Response('nope', { status: 404 });
      if (!api[2]) return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      const paths = Object.keys(repo.files);
      const dirs = [...new Set(paths.flatMap((p) => p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))))];
      return new Response(JSON.stringify({ truncated: false, tree: [...dirs.map((path) => ({ path, type: 'tree' })), ...paths.map((path) => ({ path, type: 'blob', size: 1 }))] }), { status: 200 });
    }
    const raw = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/(.+)$/.exec(url);
    if (raw) {
      const body = repos[raw[1]]?.files[raw[2]];
      return body === undefined ? new Response('nope', { status: 404 }) : new Response(body, { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  fn.calls = calls;
  return fn;
}
