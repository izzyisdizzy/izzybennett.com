---
title: "izzybennett.com"
tagline: "This site"
repo: "https://github.com/izzyisdizzy/izzybennett.com"
order: 3
links:
  - label: "Recipes"
    href: "/recipes/"
  - label: "Izzy's Cafe"
    href: "/izzys-cafe/"
---

The site you're reading. Astro and Tailwind, statically built and deployed to GitHub Pages on every push, styled with **Dizzy** — my own retrofuturist design system: an early-2000s personal page rebuilt with a 2026 stylesheet.

## Recipes as files

Every recipe is a structured markdown file: grouped ingredients with quantities and units, steps, notes. The site converts US measures to grams from a shared density table, links ingredient mentions inside the steps to their amounts, and publishes the whole archive as JSON. Adding a recipe is adding a file — or using the in-browser editor, which signs in with GitHub and commits through a small Cloudflare Worker so no token ever reaches the browser.

## A cafe with a kitchen queue

[Izzy's Cafe](/izzys-cafe/) is a real menu for people in my home. The menu markdown is the single source of truth: it feeds the cafe page, the [order form](/order/), the JSON feed the kitchen sign reads, and a phone-friendly menu editor. Orders go to a small FastAPI service on a Raspberry Pi, and the kitchen works through them on a live board.

## Pieces that grew up and moved out

The recipe engine, the menu parser and the sign-in client each started here and were extracted into their own packages, pinned back into the site by git tag.
