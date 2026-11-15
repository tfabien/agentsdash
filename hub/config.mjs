// Configuration of the hub: ~/.agentsdash/config.json (the old ~/.claude/agent-gadget.json as a fallback), overridden by environment variables.
import { configPath, envVar } from './paths.mjs';
import { readJsonObject } from './json_file.mjs';
import { isName } from './web/theme_schema.js';

export const DEFAULT_HOST = '127.0.0.1:8765';

export const defaultConfigPath = configPath;

/**
 * @returns {{lan: {enabled: boolean, bind: string}, host: string, relay: {mode: string, host?: string, port?: string}, max_sessions: number, first_theme: string}}
 * Never throws: a missing or broken file gives the defaults.
 */
export function loadConfig(file = defaultConfigPath(), env = process.env) {
  const data = readJsonObject(file);
  const relay = data.relay && typeof data.relay === 'object' && typeof data.relay.mode === 'string' ? data.relay : { mode: 'none' };
  const wanted = Number(envVar('MAX_SESSIONS', env) ?? data.max_sessions);
  const maxSessions = Number.isInteger(wanted) && wanted >= 1 && wanted <= 32 ? wanted : 24;
  const lanData = data.lan && typeof data.lan === 'object' && !Array.isArray(data.lan) ? data.lan : {};
  const lan = {
    enabled: ['1', 'true'].includes(envVar('LAN', env)) || lanData.enabled === true,
    bind: typeof lanData.bind === 'string' && lanData.bind ? lanData.bind : '0.0.0.0',
  };
  return {
    lan,
    host: envVar('HOST', env) || (typeof data.host === 'string' && data.host) || DEFAULT_HOST,
    relay,
    max_sessions: maxSessions,
    first_theme: [envVar('THEME', env), data.theme].find(isName) ?? 'robot',
  };
}
