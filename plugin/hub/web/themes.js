// Themes of the page: a color table (same keys as COLOR of screen.js) and the icon pack to draw the agents with.
// A theme is a plain object { name, label?, author?, version?, iconPack?, colors: { KEY: '#rrggbb' } }. Missing or invalid colors keep the
// built-in value, a missing or unknown icon pack gives the robots. The active theme is global (setting `theme`, kept by the hub).
import { COLOR } from './screen.js';
import { iconPackFor, setCatalogPacks } from './icon_packs.js';
import { validateTheme } from './theme_schema.js';

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

export { validateTheme };

/** A color of `theme` as a CSS string (the built-in value when the theme leaves it out). */
export function themeColor(theme, key) {
  const hex = theme.colors[key];
  if (hex && HEX.test(hex)) return hex;
  const v = BASE[key];
  return `rgb(${[((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31].map(Math.floor).join(',')})`;
}

let active = THEMES[DEFAULT_THEME];
let catalogThemes = null;                                    // name -> theme of the hub catalog; null until one arrived

/** Stores the hub catalog ({ themes, packs }). THEMES stays the offline fallback and the source of `default`. */
export function setCatalog(catalog) {
  catalogThemes = new Map();
  for (const t of catalog?.themes ?? []) if (t && typeof t.name === 'string' && t.colors && typeof t.colors === 'object') catalogThemes.set(t.name, t);
  setCatalogPacks(catalog?.packs);
}

/** The themes to list: the catalog when one arrived, else the built-in table. */
export const listThemes = () => (catalogThemes ? [...catalogThemes.values()] : Object.values(THEMES));
const findTheme = (name) => catalogThemes?.get(name) ?? THEMES[name];

/** Makes `theme` (an object of THEMES, or its name) the one every drawing reads. An unknown or missing name gives the default theme. */
export function applyTheme(theme) {
  const t = (typeof theme === 'string' ? findTheme(theme) : theme) ?? THEMES[DEFAULT_THEME];
  Object.assign(COLOR, BASE);
  for (const [key, hex] of Object.entries(t.colors)) if (key in BASE && HEX.test(hex)) COLOR[key] = to565(hex);
  active = t;
  return t;
}

export const activeTheme = () => active;
/** The icon pack of the active theme. */
export const activeIconPack = () => iconPackFor(active.iconPack);
