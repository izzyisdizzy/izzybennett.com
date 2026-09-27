import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
// `z` re-exported from astro:content is deprecated; astro/zod is the same instance the
// content layer validates with (and what @izzy/recipe-engine's schema imports).
import { z } from 'astro/zod';
// The recipe schema lives in @izzy/recipe-engine. Astro caches the content store on this
// file's own bytes, not its imports — so after bumping the engine, `.astro/` must be cleared
// (the `prebuild` script does this) or builds keep serving data validated by the old schema.
import { recipeSchema } from '@izzy/recipe-engine/schema';
import { FEED_KINDS } from './lib/feeds';

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: recipeSchema,
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

// One entry per project: the frontmatter drives the /projects/ grid, the markdown body is the
// detail page. `icon` resolves relative to the entry (../../assets/…); `demo` picks the live
// feed window a detail page shows under its prose (feeds are described in src/lib/feeds.ts).
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      tagline: z.string(),
      repo: z.url().optional(),
      icon: image().optional(),
      order: z.number().int(),
      links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
      demo: z.enum(FEED_KINDS).optional(),
    }),
});

export const collections = { recipes, pages, projects };
