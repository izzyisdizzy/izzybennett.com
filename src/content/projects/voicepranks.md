---
title: "Voice Pranks"
tagline: "Talk like a Minion on any call"
repo: "https://github.com/izzyisdizzy/voicepranks"
icon: "../../assets/voicepranks-icon.png"
order: 2
---

Voice Pranks makes you sound like a Minion in real time. It works on macOS and Windows, and it's written in plain Python. The only libraries are numpy and sounddevice, and I wrote the audio processing myself instead of pulling in scipy or librosa.

It listens to your actual microphone and pitches your voice up, chipmunk style. It also boosts the frequencies that make a voice sound close and clear, and fades that boost in over about a second so it doesn't hit all at once. The result goes out to a virtual audio device, which Discord, Zoom or OBS can pick as a microphone like any other.

## How it works

Your mic goes in, gets pitched up and EQ'd, and comes out on a virtual device. On a Mac that device is BlackHole, and on Windows it's VB-CABLE. Install one of those, then tell your voice app to use it as its microphone.

## You don't need Python

There's a ready-made app for each platform that you can just double-click, and the setup steps come with it. The one thing you have to install yourself is the virtual audio cable. It's free, but it's a system driver, so I can't bundle it.
