// Themes of the page: a color table (same keys as COLOR of screen.js) and the icon pack to draw the agents with.
// A theme is a plain object { name, label?, author?, version?, iconPack?, colors: { KEY: '#rrggbb' } }. Missing or invalid colors keep the
// built-in value, a missing or unknown icon pack gives the robots. The active theme is global (setting `theme`, kept by the hub).
import { COLOR } from './screen.js';
import { ICON_PACKS, DEFAULT_PACK, iconPack } from './icon_packs.js';

const BASE = { ...COLOR };                                   // the palette of ui_theme.h, as RGB565
const to565 = (hex) => { const n = parseInt(hex.slice(1), 16); return (((n >> 19) & 31) << 11) | (((n >> 10) & 63) << 5) | ((n >> 3) & 31); };
const HEX = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_THEME = 'default';

export const THEMES = {
  default: { name: 'default', label: 'Default', author: 'standup-bot', version: '1', iconPack: 'robot', colors: {} },
  cat: {
    name: 'cat', label: 'Cat', author: 'standup-bot', version: '1', iconPack: 'cat',
    colors: {
      SCREEN: '#1c1410', BAR: '#2a1d16', FRAME: '#6b4630', PANEL: '#2a1d16', ROW: '#3a2820', TEXT: '#fbeedd', LIGHT: '#e0c9ae', FAINT: '#9a8068',
      WORKING: '#8fd18a', NEEDS: '#ffa94d', ERROR: '#ff6b6b', YOURTURN: '#8fc4e8', WAITING: '#c4a6f0', ACCENT: '#ffcb7a', CHIP: '#5b4032',
      ACCENT_DIM: '#5a4326', NEEDS_DIM: '#7a4a1a',
    },
  },
  lemmings: {
    name: 'lemmings', label: 'Lemmings', author: 'standup-bot', version: '1', iconPack: 'lemmings',
    colors: {
      SCREEN: '#0a1a0e', BAR: '#0e2a18', FRAME: '#2a6b3a', PANEL: '#0e2214', ROW: '#153322', TEXT: '#e8f5dc', LIGHT: '#b9dcb0', FAINT: '#6f9a73',
      WORKING: '#5bd65b', NEEDS: '#ffb23e', ERROR: '#ff5a5a', YOURTURN: '#6fa3ff', WAITING: '#6fd6e0', ACCENT: '#ffe866', CHIP: '#2f5a3a',
      ACCENT_DIM: '#4a4a1e', NEEDS_DIM: '#7a5316',
    },
  },
  office: {
    name: 'office', label: 'Office', author: 'standup-bot', version: '1', iconPack: 'office',
    colors: {
      SCREEN: '#14181f', BAR: '#1d2430', FRAME: '#3d556e', PANEL: '#1d2430', ROW: '#283241', TEXT: '#eef2f7', LIGHT: '#c3cdd9', FAINT: '#7d8a9a',
      WORKING: '#6cc96f', NEEDS: '#f0a53a', ERROR: '#ef5b5b', YOURTURN: '#6fa8e8', WAITING: '#7fc8d9', ACCENT: '#8ec1f0', CHIP: '#46566c',
      ACCENT_DIM: '#2f4560', NEEDS_DIM: '#755020',
    },
  },
  pirates: {
    name: 'pirates', label: 'Pirates', author: 'standup-bot', version: '1', iconPack: 'pirates',
    colors: {
      SCREEN: '#0b1a24', BAR: '#10222e', FRAME: '#7a5230', PANEL: '#0f2230', ROW: '#173041', TEXT: '#f4e9d0', LIGHT: '#d5c3a0', FAINT: '#7f8f96',
      WORKING: '#6fcf97', NEEDS: '#f2a33a', ERROR: '#e5574f', YOURTURN: '#6fb4e8', WAITING: '#79d0c8', ACCENT: '#f2cc60', CHIP: '#2c4a5e',
      ACCENT_DIM: '#5a4a22', NEEDS_DIM: '#7a4e18',
    },
  },
};

/**
 * Checks a theme loaded from outside (a file, a POST).
 * @returns {{ok: true, theme: object, ignored: string[]} | {ok: false, error: string}} `theme` is complete: every COLOR key, a known pack.
 */
export function validateTheme(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'a theme is an object' };
  if (typeof raw.name !== 'string' || !/^[a-z0-9-]{1,32}$/.test(raw.name)) return { ok: false, error: 'name: 1 to 32 characters among a-z, 0-9 and -' };
  if (!raw.colors || typeof raw.colors !== 'object' || Array.isArray(raw.colors)) return { ok: false, error: 'colors: an object of KEY: "#rrggbb"' };
  const ignored = [];
  const colors = {};
  for (const key of Object.keys(BASE)) {
    const v = raw.colors[key];
    if (v === undefined) continue;
    if (typeof v === 'string' && HEX.test(v)) colors[key] = v.toLowerCase(); else ignored.push(key);
  }
  const pack = typeof raw.iconPack === 'string' && ICON_PACKS[raw.iconPack] ? raw.iconPack : DEFAULT_PACK;
  return { ok: true, ignored, theme: { name: raw.name, label: typeof raw.label === 'string' ? raw.label : raw.name, author: String(raw.author ?? ''), version: String(raw.version ?? ''), iconPack: pack, colors } };
}

/** A color of `theme` as a CSS string (the built-in value when the theme leaves it out). */
export function themeColor(theme, key) {
  const hex = theme.colors[key];
  if (hex && HEX.test(hex)) return hex;
  const v = BASE[key];
  return `rgb(${[((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31].map(Math.floor).join(',')})`;
}

let active = THEMES[DEFAULT_THEME];

/** Makes `theme` (an object of THEMES, or its name) the one every drawing reads. An unknown name gives the default theme. */
export function applyTheme(theme) {
  const t = typeof theme === 'string' ? THEMES[theme] ?? THEMES[DEFAULT_THEME] : theme;
  Object.assign(COLOR, BASE);
  for (const [key, hex] of Object.entries(t.colors)) if (key in BASE && HEX.test(hex)) COLOR[key] = to565(hex);
  active = t;
  return t;
}

export const activeTheme = () => active;
/** The icon pack of the active theme. */
export const activeIconPack = () => iconPack(active.iconPack);
