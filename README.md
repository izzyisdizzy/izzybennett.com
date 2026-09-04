# izzybennett.com

Personal website — resume, recipes, and projects — built with [Astro](https://astro.build) and Tailwind CSS.

Recipes live as structured markdown in `src/content/recipes/`; adding a new one is just a new file, no route wiring needed. Deploys automatically to GitHub Pages via `.github/workflows/deploy.yml` on push to `master`.

## Commands

| Command           | Action                                      |
| :----------------- | :------------------------------------------ |
| `npm install`       | Install dependencies                        |
| `npm run dev`       | Start local dev server at `localhost:4321`   |
| `npm run build`     | Build production site to `./dist/`          |
| `npm run preview`   | Preview the build locally before deploying   |
| `npm run resume`    | Regenerate `public/resume.pdf` from source   |

## Resume

`public/resume.pdf` is generated — never edit or replace it by hand. The source
of truth is `resume/resume.typ` ([Typst](https://typst.app)). To update the
resume: edit the `.typ` file, run `npm run resume`, and commit both files.

Requires the Typst CLI and the Carlito font (metric-compatible Calibri clone):

```sh
brew install typst
brew install --cask font-carlito
```
