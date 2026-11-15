// Temp folders for the test hubs. A hub started without `userDir` reads the developer's real ~/.agentsdash (themes, packs),
// so every startHub call in hub/test passes one (checked by a test in hub.test.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const tmpUserDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hubu-'));
