#!/bin/bash
# Rokid Claude · 无线 adb 引导:插一次线,之后免线 install/push。
# 原理:adb tcpip 让眼镜在 WiFi 上开 adb 端口 → adb connect 走 WiFi。
# 用法:眼镜【开发线】插 Mac、且已联 WiFi(和 Mac 同一局域网),双击本文件。
# 注意:眼镜【重启后】tcpip 模式会丢,重插线再跑一次即可。
cd "$(dirname "$0")"
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
[ -x "$ADB" ] || ADB="$(command -v adb || true)"
if [ -z "$ADB" ] || [ ! -x "$ADB" ]; then
  echo "✗ 找不到 adb。请装 Android 平台工具(Android Studio 自带,或 brew install android-platform-tools)。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
PORT=5555

echo "──────────────────────────────"
echo "  Rokid Claude · 无线 adb 引导"
echo "──────────────────────────────"

# 1) 必须有一台 USB 连着的眼镜(tcpip 引导要走 USB)
if ! "$ADB" -d get-state >/dev/null 2>&1; then
  echo "✗ 没检测到【USB 连接】的眼镜。请用开发线插上眼镜后重跑。"
  echo "  (引导只需插一次线;成功后即可拔线。)"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
echo "✓ 眼镜已 USB 连接"

# 2) 取眼镜 WiFi IP
IP=$("$ADB" -d shell ip addr show wlan0 2>/dev/null | grep -o 'inet [0-9.]*' | head -1 | awk '{print $2}')
if [ -z "$IP" ]; then
  echo "✗ 眼镜没拿到 WiFi IP。请先让眼镜连上和 Mac 同一个 WiFi(可用扫码配网),再重跑。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
echo "✓ 眼镜 WiFi IP:$IP"

# 3) 切 tcpip 模式 + 无线连接
"$ADB" -d tcpip "$PORT" >/dev/null 2>&1
sleep 2
"$ADB" connect "$IP:$PORT" >/dev/null 2>&1
sleep 1

# 4) 验证无线链路
if "$ADB" -s "$IP:$PORT" shell true >/dev/null 2>&1; then
  echo "✓ 无线 adb 已就绪:$IP:$PORT"
  echo ""
  echo "现在可以【拔掉开发线】。以后免线操作(在项目根目录跑):"
  echo "    adb connect $IP:$PORT     # 重连(若断开)"
  echo "    adb install -r android/app/build/outputs/apk/debug/app-debug.apk"
  echo "    adb push config.json /sdcard/Android/data/com.rokid.relayhud/files/config.json"
  echo ""
  echo "⚠️ 眼镜重启后 tcpip 模式会丢——重插线再跑本脚本即可。"
  echo "⚠️ 安全:$PORT 在局域网上无鉴权,任何同网设备都能连。仅在可信家庭网络用;"
  echo "   公共 WiFi 下别开,用完可 'adb disconnect $IP:$PORT'。"
else
  echo "✗ 无线连接没成功。常见原因:眼镜与 Mac 不在同一局域网 / 防火墙挡了 $PORT。"
  echo "  确认同网后重跑;或保持 USB 直接用。"
fi
echo ""
read -n 1 -s -r -p "按任意键关闭…"
