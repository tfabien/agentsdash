// First launch: with no theme in the user folder, downloads one default theme from the first marketplace source.
// The core ships the built-in line theme only; the caller's `hasTheme` leaves it out, so the first launch still downloads one.

export const FIRST_THEME = 'robot';

/**
 * @param {{ sources: string[], hasTheme: () => boolean, list: (source: string) => Promise<{themes: object[]}>, install: (theme: object) => Promise<unknown>, preferred?: string }} p
 * @returns {Promise<string | null>} the installed theme name, or null when a theme exists already or nothing could be installed (the caller retries later)
 */
export async function installFirstTheme({ sources, hasTheme, list, install, preferred = FIRST_THEME }) {
  if (hasTheme()) return null;
  for (const source of sources) {
    try {
      const { themes } = await list(source);
      const theme = themes.find((t) => t.name === preferred) ?? themes[0];
      if (!theme) continue;
      await install(theme);
      return theme.name;
    } catch { /* the next source, or the next try */ }
  }
  return null;
}
