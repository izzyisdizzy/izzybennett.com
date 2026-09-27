---
title: "The recipes feed"
tagline: "Every recipe, as JSON"
icon: "../../assets/recipes-icon.png"
order: 4
demo: "recipes-feed"
links:
  - label: "recipes.json"
    href: "/recipes.json"
  - label: "densities.json"
    href: "/densities.json"
---

Every published recipe on this site is also available as one public JSON document at `/recipes.json`: an array of recipes, each with its `slug`, `title`, `category`, `keywords`, prep and cook times, tools, grouped ingredients (`name`, `qty`, `unit`) and steps — exactly the frontmatter the pages are rendered from. Drafts are left out.

Alongside it, `/densities.json` publishes the grams-per-cup table the site uses to convert US volumes to weights, keyed by ingredient name.

## Who uses it

The in-browser recipe editor loads the feed to offer "edit an existing recipe", and the density table to know which ingredients still need a gram conversion. Both are static files rebuilt with every deploy, so anything else — a shopping-list script, a kitchen display — can read them too. No key, no rate limit, no tracking.
