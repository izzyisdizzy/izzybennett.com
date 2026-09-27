---
title: "Voice Pranks"
tagline: "Real-time Minion-voice mic filter"
repo: "https://github.com/izzyisdizzy/voicepranks"
icon: "../../assets/voicepranks-icon.png"
order: 2
---

A real-time "Minion voice" microphone filter for macOS and Windows, written in pure Python — numpy and sounddevice with hand-rolled DSP, no scipy or librosa.

It captures your physical microphone, pitch-shifts it up (chipmunk-style, formants move up too) with a presence-EQ boost that ramps in over about a second, and routes the result to a virtual audio device so Discord, Zoom or OBS can pick it up as their microphone input.

## How it works

Physical mic → capture → pitch shift up + presence EQ → virtual output device. The virtual device is BlackHole on macOS or VB-CABLE on Windows; install one, then point your voice app's microphone at it.

## No Python required

Prebuilt bundles ship as a double-clickable app for each platform, with the install steps inside. The only extra piece is the free virtual audio cable driver, which is a system component and can't be bundled.
