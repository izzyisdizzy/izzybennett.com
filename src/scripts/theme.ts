// The daylight / afterglow theme choice. ThemeBoot.astro stamps <html data-theme> before first
// paint (stored choice, else the OS preference) and ThemeToggle.astro flips it; both go through
// here so the storage key, the theme ids and the page-ground colours live in one place.
//
// THEME_KEY is a contract with visitors' browsers: renaming it resets everyone to the OS default.
import tokens from '../dizzy/tokens.json';

export const THEME_KEY = 'izzy-theme';

export const THEMES = ['daylight', 'afterglow'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** The `surface` token per theme — what the browser chrome (theme-color) should match. */
export const SURFACE: Record<Theme, string> = tokens.color.tokens.find((token) => token.name === 'surface')!.value;

/** Stamp the theme on <html> and keep every theme-color meta in step with the page ground. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', SURFACE[theme]);
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode — the choice just won't persist */
  }
}
