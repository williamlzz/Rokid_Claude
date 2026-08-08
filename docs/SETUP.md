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
  or build it yourself with `./gradlew :app:assembleDebug`. Building needs
  **JDK 17** and the Android SDK. On macOS the system default may be an older JDK;
  point Gradle at 17 explicitly (otherwise it fails with a cryptic
  "Could not resolve com.android.tools.build:gradle"):
  ```bash
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  ```
  `adb` must be on your PATH or at `$ANDROID_HOME/platform-tools/adb`.

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
2. **Start the remote stack:**
   ```bash
   ./start-remote.command
   ```
   On first run the script creates `relay/.remote.env` with a random
   `ROKID_TOKEN`. If you have a fixed ngrok domain, put it in `NGROK_DOMAIN`;
   otherwise the script uses ngrok's temporary public URL.
3. **Point the client at the tunnel.** The script writes
   `config.remote.generated.json` plus `config.remote.qr.txt` (and
   `config.remote.qr.png` when `qrencode` is installed). Use either:
   ```bash
   adb push config.remote.generated.json /sdcard/Android/data/com.rokid.relayhud/files/config.json
   ```
   or scan the `RCLAUDE:` config QR from the glasses while disconnected.

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

The same scanner also reads a **config QR** of the form
`RCLAUDE:url=wss://<host>;token=<token>;lang=zh`, which writes `config.json`
(serverUrl / token / lang) in-app — no `adb push` needed. On a hit it shows a
confirm screen with the **serverUrl only** (never the token); single-tap writes
the config and restarts the app to reconnect, double-tap cancels. Together with
the Wi-Fi QR, this lets a non-technical user go from a fresh install to running
without a cable — only installing the APK still needs sideloading.

The relay serves a local generator at `/wifi-qr.html` with a **type switch
(Wi-Fi / Config)**. Wi-Fi mode takes an SSID + password; Config mode takes a
serverUrl + token + language. Both render the QR entirely in-page — the password
or token never leaves the browser. The Wi-Fi QR is also useful for iPhone
Personal Hotspot (no built-in QR); Android hotspots and many routers show one
natively.

> ⚠️ A config QR embeds the token (equivalent to remote code execution on your
> Mac). Treat that QR image like a password — don't share or post it.

Say **"网络" / "wifi"** any time (when connected) to open the system Wi-Fi panel.

## Wireless adb (optional, owner convenience)

Once the glasses are on the same Wi-Fi LAN as your Mac, you can install APKs and
push config over Wi-Fi instead of the cable. Plug in **once** and run
`./wireless-adb.command` — it runs `adb tcpip 5555` and `adb connect <glasses-IP>:5555`,
then you can unplug and `adb install -r` / `adb push` wirelessly.

> tcpip mode is lost when the glasses reboot — re-run the script (plug in once).
> Port 5555 is unauthenticated on the LAN, so only use this on a trusted home
> network; `adb disconnect <IP>:5555` when done. Non-technical users should still
> use the QR provisioning path (no adb at all).

## Watching the session on your Mac

The relay serves a web client (the "Rokid HUD simulator") at its own URL. It
connects to the **same relay** and receives the **same event stream** as the
glasses, so opening it mirrors the HUD — and because it sends its last position
on connect, the relay replays the **current run's history**, not just new
output. You can also type prompts from the page.

**Local mode:** run `./start.command`, then open **http://localhost:8787** in a
Mac browser — you'll see (and can drive) the same session as the glasses.

**Remote mode:** open `https://<your-ngrok-domain>/?token=<ROKID_TOKEN>`. The
page passes that token to its WebSocket connection and uses `wss://` on HTTPS.

One limitation to know:

1. **Read-only ride-along.** Output, usage, and permission/model prompts are
   broadcast to **all** connected clients, so both the glasses and the Mac page
   see them. The Mac page only displays permission/model prompts — you still
   confirm them **on the glasses** (the page has no verdict buttons). Either side
   can send a prompt, but don't drive the same session from both at once.

## Voice commands

- **Tap** — start talking / stop recording / interrupt a running task.
- **Double-tap** — blank the screen (the task keeps running); when **offline**,
  double-tap exits the app, single-tap opens the Wi-Fi QR scanner, and swipe
  opens the Wi-Fi panel.
- Say **"新会话" / "new session"** to reset, **"退出" / "exit"** to close.
- Say **"切换模型" / "switch model"** to open the model picker (opus / sonnet /
  haiku), then swipe to choose and tap to confirm.
- Say **"网络" / "wifi"** to open the system Wi-Fi panel.
- Say **"切换语言" / "switch language"** to toggle the interface language (UI +
  speech recognition + replies) between `zh` and `en` for the current session.
  The trigger is recognized in either language, so you can switch even when
  you're stuck in one you don't speak. It resets to `config.json`'s `lang` on
  restart (not persisted).
- Language (UI + speech) starts from `lang` in `config.json` (`zh` or `en`).
- Spoken shortcuts are defined in `relay/dictionary.<lang>.json` (edit live).

## Troubleshooting

**The HUD footer stays "disconnected".** The relay isn't running or isn't
reachable. Locally, re-run `./start.command` (it sets up `adb reverse` and starts
the relay). Remotely, check that `start-remote.command` is still running, the
Mac is awake, and the glasses have internet. Confirm the relay is up with
`lsof -iTCP:8787 -sTCP:LISTEN`.

**Relay logs "Not logged in" / `apiKeySource:none`.** The spawned `claude` CLI
isn't logged in. Run `claude` once interactively and `/login` (a desktop login is
separate — you still authorize the CLI once).

**Android build fails with "Could not resolve com.android.tools.build:gradle …
compatible with Java 11".** Gradle is running on an older JDK. Export
`JAVA_HOME` to a JDK 17 (see Prerequisites) and retry.

**Speech gets cut off or misheard.** Speak at a normal volume, not too far from
the mic, and pause when done. English letters/acronyms can be imperfect with the
local `small` whisper model — phrase around them or correct afterward.

**Remote glasses can't reach the relay.** The config is fine; usually the Mac's
relay/ngrok died or the Mac slept. Restart `start-remote.command`; the app
auto-reconnects. The glasses also need real internet (phone hotspot) — iPhone
hotspots sleep with no device connected, so keep the Personal Hotspot screen open.
