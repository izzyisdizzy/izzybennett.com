// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://izzybennett.com',
  markdown: {
    // Fenced code in markdown bodies gets a light and a dark theme with no default baked in, so
    // tokens carry --shiki-light / --shiki-dark variables instead of fixed colours. Which one
    // shows is decided by data-theme in src/styles/site.css (.iz-prose pre), not by the OS.
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
  vite: {
    plugins: [tailwindcss()]
  }
});