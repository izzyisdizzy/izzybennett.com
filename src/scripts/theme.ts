// The daylight / afterglow theme choice. ThemeBoot.astro stamps <html data-theme> before first
// paint (stored choice, else the OS preference) and ThemeToggle.astro flips it; both go through
// here so the storage key and the two theme ids live in one place.
//
// THEME_KEY is a contract with visitors' browsers: renaming it resets everyone to the OS default.
export const THEME_KEY = 'izzy-theme';

export const THEMES = ['daylight', 'afterglow'] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** Stamp the theme on <html> and keep the browser-chrome colour in step with the page ground. */
export function applyTheme(theme: Theme, surface: Record<Theme, string>): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface[theme]);
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode — the choice just won't persist */
  }
}
