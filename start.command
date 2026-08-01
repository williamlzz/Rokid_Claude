#!/bin/bash
# Rokid Claude 一键启动:连眼镜 + 端口转发 + 起中继
# 用法:把眼镜用开发线插到 Mac,然后双击本文件(或终端运行 ./start.command)
cd "$(dirname "$0")"
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
[ -x "$ADB" ] || ADB="$(command -v adb || true)"
if [ -z "$ADB" ] || [ ! -x "$ADB" ]; then
  echo "✗ 找不到 adb。请装 Android 平台工具(Android Studio 自带,或 brew install android-platform-tools)。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi

echo "──────────────────────────────"
echo "  Rokid Claude · 本地启动(USB)"
echo "──────────────────────────────"

# 1) 检查眼镜是否连上
if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "✗ 没检测到眼镜设备。"
  echo "  请确认:① 用的是【开发线】(不是充电线);② 眼镜已开机并插到 Mac;③ 眼镜上 USB 调试开关已打开。"
  echo "  插好后重新双击本文件。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
echo "✓ 眼镜已连接"

# 2) 端口转发(眼镜的 PORT → Mac 的 PORT)。默认 8787,如本机端口被占用可设 ROKID_PORT。
PORT="${ROKID_PORT:-8787}"
"$ADB" reverse "tcp:$PORT" "tcp:$PORT" && echo "✓ 端口转发已设 ($PORT)"

# 3) 调试期屏常亮(不戴也不熄,方便看)
"$ADB" shell svc power stayon usb >/dev/null 2>&1 && echo "✓ 屏常亮(USB 连接时)"

echo ""
echo "▶ 启动中继… 看到 'Rokid relay 已启动' 后,在眼镜上打开 Rokid Claude,底部应显示【已连接】。"
echo "  用完:在本窗口按 Ctrl+C 即可停止;然后可拔眼镜。"
echo ""

# 4) 起中继(前台运行,保持本窗口开着)
CLAUDE_BIN="${CLAUDE_BINARY:-$(command -v claude || true)}"
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "✗ 找不到 claude CLI。请先安装并登录 Claude Code，或设置 CLAUDE_BINARY=/path/to/claude。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
CLAUDE_BINARY="$CLAUDE_BIN" ROKID_PORT="$PORT" npm run dev
