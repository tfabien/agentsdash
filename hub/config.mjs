// Configuration of the hub: ~/.agentsdash/config.json (the old ~/.claude/agent-gadget.json as a fallback), overridden by environment variables.
import fs from 'node:fs';
import { configPath, envVar } from './paths.mjs';

export const DEFAULT_HOST = '127.0.0.1:8765';

export const defaultConfigPath = configPath;

/**
 * @returns {{host: string, relay: {mode: string, host?: string, port?: string}, context_window: number, max_sessions: number}}
 * Never throws: a missing or broken file gives the defaults.
 */
export function loadConfig(file = defaultConfigPath(), env = process.env) {
  let data = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
  } catch { /* defaults */ }
  const relay = data.relay && typeof data.relay === 'object' && typeof data.relay.mode === 'string' ? data.relay : { mode: 'none' };
  const window = Number.isInteger(data.context_window) && data.context_window > 0 ? data.context_window : 1000000;
  const wanted = Number(envVar('MAX_SESSIONS', env) ?? data.max_sessions);
  const maxSessions = Number.isInteger(wanted) && wanted >= 1 && wanted <= 32 ? wanted : 12;
  const lanData = data.lan && typeof data.lan === 'object' && !Array.isArray(data.lan) ? data.lan : {};
  const lan = {
    enabled: ['1', 'true'].includes(envVar('LAN', env)) || lanData.enabled === true,
    bind: typeof lanData.bind === 'string' && lanData.bind ? lanData.bind : '0.0.0.0',
  };
  return {
    lan,
    host: envVar('HOST', env) || (typeof data.host === 'string' && data.host) || DEFAULT_HOST,
    relay,
    context_window: window,
    max_sessions: maxSessions,
    first_theme: [envVar('THEME', env), data.theme].find((t) => typeof t === 'string' && /^[a-z0-9-]{1,32}$/.test(t)) ?? 'robot',
  };
}
