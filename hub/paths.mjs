// Names and folders of the core: environment variables, config file, state folder, user folder.
// The old names (CLAUDE_GADGET_*, ~/.claude/agent-gadget.json, ~/.claude/standup-bot/) stay honored as a fallback for one major version.
// The core imports nothing from an adapter: the plugin scripts keep their own copy of these helpers (scripts/common.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// AGENTSDASH_USER_HOME replaces the OS home folder (tests use it so they never touch the real one).
const userHome = (env) => env.AGENTSDASH_USER_HOME || os.homedir();
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

/** Value of AGENTSDASH_<name>, else CLAUDE_GADGET_<name> (the first non-empty one), else undefined. */
export function envVar(name, env = process.env) {
  for (const prefix of ['AGENTSDASH_', 'CLAUDE_GADGET_']) {
    const v = env[prefix + name];
    if (typeof v === 'string' && v !== '') return v;
  }
  return undefined;
}

/** ~/.agentsdash, or AGENTSDASH_HOME. */
export const homeDir = (env = process.env) => env.AGENTSDASH_HOME || path.join(userHome(env), '.agentsdash');

/** Config file: AGENTSDASH_CONFIG (or the old variable), else ~/.agentsdash/config.json, else the old ~/.claude/agent-gadget.json when only that exists. */
export function configPath(env = process.env) {
  const explicit = envVar('CONFIG', env);
  if (explicit) return explicit;
  const next = path.join(homeDir(env), 'config.json');
  const legacy = path.join(userHome(env), '.claude', 'agent-gadget.json');
  return !exists(next) && exists(legacy) ? legacy : next;
}

/** Folder for the hub settings, quota history and marker files; shared with the plugin scripts. */
export const stateDir = (env = process.env) => envVar('STATE_DIR', env) || path.join(os.tmpdir(), 'agentsdash');

/** Where user themes and icon packs live. */
export const userDir = homeDir;

/**
 * Copies ~/.claude/standup-bot (the old user folder) into the user folder once: existing files are kept, the old folder is left alone,
 * `.migrated` records that it ran. Never throws. @returns {boolean} true when it copied.
 */
export function migrateUserDir(env = process.env) {
  try {
    const legacy = path.join(userHome(env), '.claude', 'standup-bot');
    const dest = userDir(env);
    if (!exists(legacy) || exists(path.join(dest, '.migrated'))) return false;
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(legacy, dest, { recursive: true, force: false, errorOnExist: false });
    fs.writeFileSync(path.join(dest, '.migrated'), `${new Date().toISOString()}\n`);
    return true;
  } catch { return false; }
}
