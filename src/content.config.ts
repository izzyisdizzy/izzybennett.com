import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
// The recipe schema lives in @izzy/recipe-engine. Astro caches the content store on this
// file's own bytes, not its imports — so after bumping the engine, `.astro/` must be cleared
// (the `prebuild` script does this) or builds keep serving data validated by the old schema.
import { recipeSchema } from '@izzy/recipe-engine/schema';

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

export const collections = { recipes, pages };
