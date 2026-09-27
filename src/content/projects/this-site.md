---
title: "izzybennett.com"
tagline: "The site you're on right now"
repo: "https://github.com/izzyisdizzy/izzybennett.com"
order: 3
links:
  - label: "Recipes"
    href: "/recipes/"
  - label: "Izzy's Cafe"
    href: "/izzys-cafe/"
---

This is the site you're looking at. It's built with Astro and Tailwind, and every time I merge to `master` it rebuilds and goes up on GitHub Pages. The look comes from **Dizzy**, a design system I made for it. The idea was a personal homepage from the early 2000s, redone with a modern stylesheet.

## Recipes as files

Each recipe is its own markdown file with the ingredients (grouped, with amounts and units), the steps and any notes. From that, the site works out gram weights for US measurements using a shared density table. It also links ingredients mentioned in the steps back to how much you need, and puts the whole collection out as JSON.

To add a recipe, I either drop in a new file or use the editor in the browser. The editor signs in with GitHub and saves through a small Cloudflare Worker, so the GitHub token never ends up in the browser.

## A cafe with a kitchen queue

[Izzy's Cafe](/izzys-cafe/) is a real menu for people who visit my place. Everything comes from one markdown file: the cafe page, the [order form](/order/), the JSON feed my kitchen sign reads, and a menu editor I can use from my phone. When someone orders, it goes to a small FastAPI service running on a Raspberry Pi, and I work through the orders on a live board in the kitchen.

## Parts that moved out

The recipe engine, the menu parser and the sign-in code all started out inside this site. Once they got big enough, I split each one into its own package, and the site pulls them back in by git tag.
