// isMain(import.meta.url): true when this module is the script started with `node <script>`, false when it is imported.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// realpath: Node reports import.meta.url as the real path, argv[1] may go through a symlink (e.g. a linked ~/.claude).
// pathToFileURL builds `file:///C:/...` on Windows and `file:///home/...` on POSIX; a missing argv[1] file gives false.
export function isMain(metaUrl) {
  try { return !!process.argv[1] && metaUrl === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
}
