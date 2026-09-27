---
title: "dizzyOS"
tagline: "A tiny OS for an LED-matrix sign"
repo: "https://github.com/izzyisdizzy/dizzyos"
icon: "../../assets/dizzyos-icon.png"
order: 1
demo: "cafe-feed"
---

A tiny "operating system" for the LED-matrix sign in my kitchen, written in Python. A small **kernel** provides the shared services — display, data, fonts, input — and self-contained **apps** plug into it, each with its own lifecycle. A **launcher** rotates through them with smooth transitions.

## The hardware

Two chained Adafruit 64×64 HUB75 panels make a 128×64 canvas, driven by a Raspberry Pi with an Adafruit RGB Matrix Bonnet. A drop-in emulator stands in for the matrix driver on a Mac, so the exact same code renders in a browser window with zero changes — which is where most of the development happens.

## The apps

- **Cafe Menu** — renders [Izzy's Cafe](/izzys-cafe/) from this site's `/izzys-cafe.json` feed, so editing the menu here updates the sign in the kitchen a minute or two later.
- **Weather** — current conditions from Open-Meteo.
- **Subway** — live next-train times from the MTA's realtime feeds.

Adding an app is a folder in `apps/` that implements `render()` plus a line in `config.yaml`; the launcher handles the rotation, the double-buffered frame loop and the transitions.

Below is the feed the Cafe Menu app reads, fetched live from this site.
