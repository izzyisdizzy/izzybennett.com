import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const categoryValues = ['main', 'dessert', 'side', 'sauce', 'drink', 'other'] as const;

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      category: z.enum(categoryValues),
      // Not a browsable taxonomy — just extra keywords folded into recipe search (see RecipeCard.astro).
      keywords: z.array(z.string()).default([]),
      prepTime: z.number().int().nonnegative().optional(),
      cookTime: z.number().int().nonnegative().optional(),
      servings: z.number().int().positive().optional(),
      tools: z.array(z.string()).default([]),
      ingredients: z.array(
        z.object({
          group: z.string().optional(),
          // Each item is structured so the recipe page can convert US measurements to grams.
          // qty/unit are optional: count or loose items ("1 lemon", "Salt to taste") have neither.
          items: z.array(
            z.object({
              name: z.string(),
              qty: z.string().optional(), // freeform to preserve "2 ¼", "6-8", "½"
              unit: z.string().optional(), // "cup", "tbsp", "oz", "g", … or absent for count items
              // Preparation note rendered after the name ("softened", "grated", "room temp").
              // Kept out of `name` so `name` stays a clean density-lookup and prose-matching key.
              detail: z.string().optional(),
            })
          ),
        })
      ),
      steps: z.array(
        z.object({
          group: z.string().optional(),
          items: z.array(z.string()),
        })
      ),
      notes: z.array(z.string()).default([]),
      image: image().optional(),
      draft: z.boolean().default(false),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { recipes, pages };
