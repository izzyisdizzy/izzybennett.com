---
title: "dizzyOS"
tagline: "The software behind the LED sign in my kitchen"
repo: "https://github.com/izzyisdizzy/dizzyos"
icon: "../../assets/dizzyos-icon.png"
order: 1
demo: "cafe-feed"
---

I have an LED sign in my kitchen, and dizzyOS is what runs it. It's a small Python program that I built like a toy operating system. There's a kernel that handles the shared stuff (drawing to the display, fetching data, fonts, input), and then a handful of apps that each do one thing. A launcher cycles through the apps and animates the switch between them.

## The hardware

The sign is two Adafruit 64×64 HUB75 panels chained together into one 128×64 screen. A Raspberry Pi drives them through an Adafruit RGB Matrix Bonnet.

I don't want to be standing in the kitchen every time I change a font, so there's also an emulator that swaps in for the matrix driver on my Mac. The same code draws into a browser window instead of the panels, and that's where I do most of the work.

## The apps

- **Cafe Menu** shows the [Izzy's Cafe](/izzys-cafe/) menu, pulled from this site's `/izzys-cafe.json` feed. If I change the menu here, the sign picks it up a minute or two later.
- **Weather** shows what it's like outside, using Open-Meteo.
- **Subway** shows when the next trains are coming, from the MTA's live feeds.

To add an app, you make a folder in `apps/` with a `render()` function and add its name to `config.yaml`. The launcher takes care of the rotation, the frame loop and the transitions, so the app only has to worry about what to draw:

```yaml
launcher:
  rotation:            # apps cycle in this order
    - cafe_menu
    - weather
    - subway
  default_dwell: 20    # seconds per app
  transition: slide    # or crossfade, wipe, none…
```

Here's the feed the Cafe Menu app reads. It's loaded live from this site, so it's exactly what the sign has right now.
