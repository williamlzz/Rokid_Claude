# Rokid Claude

> 用 Rokid 眼镜语音遥控家里 Mac 上的 Claude Code —— 干活进度实时显示在单色绿 HUD 上。

https://github.com/user-attachments/assets/6979aefc-f279-44ab-854c-ffca81c5dac6

*说一个任务,看 Claude Code 在绿屏 HUD 上把它做完——危险操作靠手势确认。* · [English README](README.md)

## 这是什么

Rokid Claude 把一副 [Rokid 眼镜](https://www.rokid.com)(或任意安卓手机)变成
家里 Mac 上 [Claude Code](https://www.anthropic.com) 的远程遥控器。你开口说需求,
眼镜把它发给 Mac 上的一个轻量中继,中继跑 Claude Code,并把 agent 的进度——
思考、工具调用、结果——实时流式推回到绿屏 HUD。在桌前可走 USB,出门可走
[ngrok](https://ngrok.com) 隧道从任何地方连。

## 演示

**语音切模型** —— 说「switch model」,滑动选(opus / sonnet / fable):

https://github.com/user-attachments/assets/d71357c8-0366-484c-aaa1-5de33ca66485

**运行时切语言** —— 说「switch language」,整屏 HUD 在中英之间瞬切:

https://github.com/user-attachments/assets/2a4a304b-4600-4c17-8bcb-167e576b47e8

## 架构

```
┌─────────────┐   audio(PCM)/prompt    ┌──────────────────────┐   spawn   ┌──────────────┐
│  Android    │ ─────────────────────► │  Relay (Node/TS)     │ ────────► │  claude -p   │
│  client     │   WebSocket (ws/wss)   │  :8787               │ stream-   │  (Claude     │
│  (glasses/  │ ◄───────────────────── │  whisper.cpp STT     │  json     │   Code CLI)  │
│   phone)    │   events / usage /     │  RunStore + replay   │ ◄──────── │              │
│  green HUD  │   permission prompts   │  PreToolUse hook     │           └──────────────┘
└─────────────┘                        └──────────────────────┘
```

语音在本机用 whisper.cpp 转写;中继通过 WebSocket 讲一套小巧的 JSON 协议,所以
核心与客户端无关。细节见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 功能

- 🎙️ 语音 → Claude Code,流式推到绿屏 HUD(单击说话、单击打断)
- ✅ 危险工具调用在眼镜上做权限确认(手势裁决)
- 📊 statusline:当前模型 + 会话花费/tokens
- 🗣️ 语音切模型(opus / sonnet / fable),走选择框
- 🌍 中英双语:`lang` 设初始,或运行时说「切换语言 / switch language」热切换
- 📷 机内扫码配置 —— 扫 WiFi 码联网、扫配置码填 serverUrl/token,免线免打字
- 🛟 离线自救 —— 断连时单击即开扫码页
- 🖥️ 在 Mac 上镜像查看实时会话(本地网页客户端)
- 🌐 经 ngrok 隧道从任何地方远程遥控(token 鉴权)
- 🔋 灭屏省电;可即时编辑的命令词典

## 前置要求

- 一副 **Rokid 眼镜**,或任意 **安卓手机** 当客户端。
- 一台 **跑着 Claude Code 的家用 Mac**(需付费的 Claude 订阅/API)。
- **Node.js ≥ 18**。
- **whisper.cpp** 及 `ggml-small` 模型(单独下载)。
- 出门远程用需要 **ngrok**。

这是个兴趣项目,门槛刻意偏小众——默认你已经有眼镜、且家里在跑 Claude Code。

## 快速开始

```bash
git clone <this-repo> && cd Rokid-Claude
cd relay && npm install
```

然后装客户端并配置:

1. 从 [最新 Release](https://github.com/williamlzz/Rokid_Claude/releases/latest) 侧载 APK(或自行构建:
   `cd android && ./gradlew :app:assembleDebug`)。
2. `cp config.example.json config.json`,填好 `serverUrl`,push 到设备。
3. 跑 `./start.command`(USB),在设备上打开 Rokid Claude。

完整的本地 + 远程步骤见 [docs/SETUP.md](docs/SETUP.md)。

## 安全

中继会在你 Mac 上运行 Claude Code,所以它的访问 token = 在你机器上远程执行代码的
权限。把 `relay/.remote.env` 和你真实的 `config.json` 留在 git 之外(两者都已
gitignore),没有 token 时绝不把中继裸暴露公网,并把眼镜端的权限确认当作第二道
防线。

## License

MIT —— 见 [LICENSE](LICENSE)。

## 致谢

基于 [Claude Code](https://www.anthropic.com)、
[whisper.cpp](https://github.com/ggerganov/whisper.cpp)、
[ngrok](https://ngrok.com) 构建。架构受 lark-coding-agent-bridge 与 clawsses
两个项目启发(借鉴,未抄代码)。
