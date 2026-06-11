# Setup

This guide covers running Rokid Claude locally over USB and remotely over an
ngrok tunnel.

## Prerequisites

- **macOS** (the relay and Claude Code run on your home Mac).
- **Node.js ≥ 18**.
- **Claude Code CLI** (`claude`) — installed and logged in. The relay spawns
  `claude`, so you must run `claude` once interactively and `/login` first;
  otherwise the relay only gets "Not logged in".
- **whisper.cpp** — `brew install whisper-cpp` (provides the `whisper-cli`
  binary).
- **Whisper model** — download `ggml-small.bin` from
  [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
  and place it at `relay/models/ggml-small.bin`. This directory is gitignored and
  is **not** shipped with the repo.
- **Android client** — either sideload the prebuilt APK from the GitHub Release,
  or build it yourself with `./gradlew :app:assembleDebug` (needs JDK 17 + the
  Android SDK). `adb` must be on your PATH or at
  `$HOME/Library/Android/sdk/platform-tools/adb`.

## Local setup (USB)

1. **Install relay dependencies:**
   ```bash
   cd relay && npm install
   ```
2. **Install the Android app** on the glasses/phone (Release APK or your own
   build):
   ```bash
   adb install -r app-debug.apk
   ```
3. **Configure the client.** Copy the example and edit it:
   ```bash
   cp config.example.json config.json
   ```
   - Same Wi-Fi LAN: set `"serverUrl": "ws://<your-Mac-LAN-IP>:8787"`.
   - Or over USB only: run `adb reverse tcp:8787 tcp:8787` and use
     `"serverUrl": "ws://localhost:8787"`.
   - Leave `"token": ""` for local (no auth).
   - `"lang": "zh"` or `"en"` sets the whole app language — UI, speech
     recognition, voice commands, and dictionary. Default is `zh`.

   Push it to the app's external files directory:
   ```bash
   adb push config.json /sdcard/Android/data/com.rokid.relayhud/files/config.json
   ```
4. **Start everything** with the helper script (sets up `adb reverse` and starts
   the relay in the foreground):
   ```bash
   ./start.command
   ```
   Open Rokid Claude on the device — the footer should read "已连接" (connected).

## Remote setup (ngrok)

1. **Install and authenticate ngrok:**
   ```bash
   brew install ngrok
   ngrok config add-authtoken <your-ngrok-authtoken>
   ```
   A free static domain works well.
2. **Create the relay environment file:**
   ```bash
   cp relay/.remote.env.example relay/.remote.env
   ```
   Fill in:
   - `ROKID_TOKEN` — a long random secret, e.g. `openssl rand -hex 24`.
   - `NGROK_DOMAIN` — your fixed ngrok domain (without the protocol), e.g.
     `your-subdomain.ngrok-free.dev`.
3. **Point the client at the tunnel.** In `config.json` set
   `"serverUrl": "wss://<your-ngrok-domain>"` and `"token": "<same ROKID_TOKEN>"`,
   then push it (same `adb push` command as above).
4. **Start the remote stack:**
   ```bash
   ./start-remote.command
   ```
   This launches ngrok plus the token-protected relay. When you're out of the
   house, connect the glasses to your phone's hotspot and they reach the Mac
   through the tunnel.

### Security

The `ROKID_TOKEN` is equivalent to remote code execution on your Mac: anyone who
reaches the tunnel with it can make Claude Code run commands. Never commit
`relay/.remote.env` or your real `config.json` (both are gitignored). The
on-glasses permission confirmation for risky tools is your second line of
defense.

## Connecting the glasses to Wi-Fi / a phone hotspot

The glasses have no keyboard, so you can't type a Wi-Fi password in their
settings panel. Provision Wi-Fi once over USB with the helper script — it
prompts for the SSID and password, runs `adb shell cmd wifi connect-network`,
and scrubs the password from the device log afterwards:

```bash
./setup-wifi.command
```

The credentials are saved on the glasses, so the network auto-reconnects when in
range later (e.g. when you're out of the house on your phone hotspot).

**iPhone Personal Hotspot caveat:** an iPhone hotspot sleeps when no device is
connected and won't accept the association. Open Settings → Personal Hotspot and
**stay on that screen** while the glasses connect. Android phone hotspots don't
have this issue.

### QR provisioning (no computer needed)

The glasses can also join a network by scanning a standard Wi-Fi QR code
(`WIFI:S:<ssid>;T:WPA;P:<password>;;`) with their camera — no USB, no typing.
When **disconnected**, **single-tap** opens the scanner; point it at a Wi-Fi QR
and confirm the system "save network?" dialog. The network is saved and
auto-reconnects in range. (**Swipe** opens the system Wi-Fi panel instead, for
already-saved or open networks; **double-tap** exits.)

The relay serves a local generator at `/wifi-qr.html` — enter an SSID and
password to render a Wi-Fi QR entirely in-page (the password never leaves the
browser). Useful for iPhone Personal Hotspot, which has no built-in Wi-Fi QR.
Android phone hotspots and many routers can show one natively.

Say **"网络" / "wifi"** any time (when connected) to open the system Wi-Fi panel.

## Voice commands

- **Tap** — start talking / stop recording / interrupt a running task.
- **Double-tap** — blank the screen (the task keeps running); when **offline**,
  double-tap exits the app, single-tap opens the Wi-Fi QR scanner, and swipe
  opens the Wi-Fi panel.
- Say **"新会话" / "new session"** to reset, **"退出" / "exit"** to close.
- Say **"切换模型" / "switch model"** to open the model picker (opus / sonnet /
  fable), then swipe to choose and tap to confirm.
- Say **"网络" / "wifi"** to open the system Wi-Fi panel.
- Say **"切换语言" / "switch language"** to toggle the interface language (UI +
  speech recognition + replies) between `zh` and `en` for the current session.
  The trigger is recognized in either language, so you can switch even when
  you're stuck in one you don't speak. It resets to `config.json`'s `lang` on
  restart (not persisted).
- Language (UI + speech) starts from `lang` in `config.json` (`zh` or `en`).
- Spoken shortcuts are defined in `relay/dictionary.<lang>.json` (edit live).
