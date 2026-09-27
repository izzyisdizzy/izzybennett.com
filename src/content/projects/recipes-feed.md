---
title: "The recipes feed"
tagline: "All my recipes as one JSON file"
icon: "../../assets/recipes-icon.png"
order: 4
demo: "recipes-feed"
links:
  - label: "recipes.json"
    href: "/recipes.json"
  - label: "densities.json"
    href: "/densities.json"
---

Every recipe I've published here is also in one public JSON file at `/recipes.json`. It's a list of recipes, and each one has its `slug`, `title`, `category`, `keywords`, prep and cook times, tools, ingredients in their groups (`name`, `qty`, `unit`) and steps. That's the same data the recipe pages are built from. Drafts aren't included.

There's a second file, `/densities.json`, with the grams-per-cup numbers the site uses to turn US measurements into weights. It's keyed by ingredient name.

## Who uses it

Mostly the recipe editor on this site. It reads the feed so I can pick an existing recipe to edit, and it reads the density table to see which ingredients still don't have a gram conversion. Both files are just static files that get rebuilt whenever the site deploys, so anything else can read them too, like a shopping list script or a screen in the kitchen. You don't need a key, there's no rate limit, and nothing is tracked.
