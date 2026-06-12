# Rokid Claude

> Voice-control Claude Code on your home Mac from Rokid Glasses — watch it work, live, on a monochrome-green HUD.

https://github.com/user-attachments/assets/6979aefc-f279-44ab-854c-ffca81c5dac6

*Speak a task; watch Claude Code do it on the green HUD — permission confirmed by a gesture.* · [中文 README](README_zh.md)

## What it is

Rokid Claude turns a pair of [Rokid Glasses](https://www.rokid.com) (or any
Android phone) into a remote control for [Claude Code](https://www.anthropic.com)
running on your Mac at home. You speak a request; the glasses send it to a small
relay on your Mac, which runs Claude Code and streams the agent's progress —
thoughts, tool calls, results — back to the green heads-up display in real time.
Use it over USB on your desk, or over an [ngrok](https://ngrok.com) tunnel from
anywhere.

## Demo

**Voice model switch** — say "switch model", then swipe to pick (opus / sonnet / fable):

https://github.com/user-attachments/assets/d71357c8-0366-484c-aaa1-5de33ca66485

**Runtime language switch** — say "switch language"; the whole HUD flips between Chinese and English:

https://github.com/user-attachments/assets/2a4a304b-4600-4c17-8bcb-167e576b47e8

## Architecture

```
┌─────────────┐   audio(PCM)/prompt    ┌──────────────────────┐   spawn   ┌──────────────┐
│  Android    │ ─────────────────────► │  Relay (Node/TS)     │ ────────► │  claude -p   │
│  client     │   WebSocket (ws/wss)   │  :8787               │ stream-   │  (Claude     │
│  (glasses/  │ ◄───────────────────── │  whisper.cpp STT     │  json     │   Code CLI)  │
│   phone)    │   events / usage /     │  RunStore + replay   │ ◄──────── │              │
│  green HUD  │   permission prompts   │  PreToolUse hook     │           └──────────────┘
└─────────────┘                        └──────────────────────┘
```

Speech is transcribed locally with whisper.cpp; the relay speaks a small JSON
protocol over WebSocket so the core is client-agnostic. See
[ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Features

- 🎙️ Voice → Claude Code, streamed to a green HUD (tap to talk, tap to interrupt)
- ✅ On-glasses permission confirmation for risky tool calls (gesture verdict)
- 📊 Statusline: current model + session cost/tokens
- 🗣️ Voice model switch (opus / sonnet / fable) via a picker
- 🌍 Bilingual (Chinese / English): set via `lang`, or switch at runtime by voice ("切换语言 / switch language")
- 📷 On-device QR provisioning — scan a Wi-Fi QR to join a network, or a config QR to set serverUrl/token (no cable, no typing)
- 🛟 Offline self-rescue — when disconnected, single-tap opens the QR scanner
- 🖥️ Mirror the live session on your Mac (local web client)
- 🌐 Remote control from anywhere via an ngrok tunnel (token-authed)
- 🔋 Screen-off power saving; editable command dictionary

## Requirements

- A **Rokid Glasses** *or* any **Android phone** as the client.
- A **home Mac running Claude Code** (a paid Claude subscription/API access).
- **Node.js ≥ 18**.
- **whisper.cpp** plus the `ggml-small` model (downloaded separately).
- **ngrok** for remote (out-of-home) use.

This is a hobby project with a deliberately niche setup — it assumes you already
own the glasses and run Claude Code at home.

## Quick Start

```bash
git clone <this-repo> && cd Rokid-Claude
cd relay && npm install
```

Then install the client and configure it:

1. Sideload the APK from the [latest Release](https://github.com/williamlzz/Rokid_Claude/releases/latest) (or
   build it: `cd android && ./gradlew :app:assembleDebug`).
2. `cp config.example.json config.json`, set `serverUrl`, and push it to the
   device.
3. Run `./start.command` (USB) and open Rokid Claude on the device.

Full local and remote instructions: [docs/SETUP.md](docs/SETUP.md).

## Security

The relay runs Claude Code on your Mac, so its access token equals remote code
execution on your machine. Keep `relay/.remote.env` and your real `config.json`
out of git (both are gitignored), never expose the relay publicly without a
token, and rely on the on-glasses permission confirmation as a second line of
defense.

## License

MIT — see [LICENSE](LICENSE).

## Acknowledgements

Built on [Claude Code](https://www.anthropic.com),
[whisper.cpp](https://github.com/ggerganov/whisper.cpp), and
[ngrok](https://ngrok.com). Architecture inspired by the lark-coding-agent-bridge
and clawsses projects (studied, not copied).
