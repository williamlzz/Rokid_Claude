#!/bin/bash
# Rokid Claude 远程启动:中继(带 token)+ ngrok 隧道
# 前置:1) brew install ngrok 并 `ngrok config add-authtoken <你的authtoken>`(只做一次)
#       2) 复制 relay/.remote.env.example 为 relay/.remote.env 并填 ROKID_TOKEN / NGROK_DOMAIN
cd "$(dirname "$0")"

ENV_FILE="relay/.remote.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ 缺 $ENV_FILE。请复制 relay/.remote.env.example 为它并填好 ROKID_TOKEN / NGROK_DOMAIN。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
set -a; . "$ENV_FILE"; set +a
if [ -z "$ROKID_TOKEN" ] || [ -z "$NGROK_DOMAIN" ]; then
  echo "✗ $ENV_FILE 里 ROKID_TOKEN 或 NGROK_DOMAIN 为空。"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
if ! command -v ngrok >/dev/null 2>&1; then
  echo '✗ 没装 ngrok。先 brew install ngrok 并 ngrok config add-authtoken <你的authtoken>。'
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi

echo "──────────────────────────────"
echo "  Rokid Claude · 远程启动(ngrok)"
echo "  眼镜 config.json 里 serverUrl 应填: wss://$NGROK_DOMAIN"
echo "──────────────────────────────"

# 起 ngrok(后台),把本地 8787 暴露到固定域名
# 注意:给 ngrok 单独清掉 http(s) 代理变量——ngrok 免费档不允许 agent 走代理(ERR_NGROK_9009),
# 且 ngrok 服务器一般直连可达。中继自身不清代理(claude 在国内可能要靠代理访问 API)。
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u all_proxy \
  ngrok http 8787 --url="$NGROK_DOMAIN" --log=stdout > /tmp/rokid-ngrok.log 2>&1 &
NGROK_PID=$!
trap 'kill $NGROK_PID 2>/dev/null' EXIT
sleep 2
echo "✓ ngrok 已拨出 (PID $NGROK_PID,日志 /tmp/rokid-ngrok.log)"

# 起中继(前台,带 token);本窗口 Ctrl+C 即同时停 ngrok
echo "▶ 启动中继… 看到 '鉴权: 已开启' 即就绪。用完按 Ctrl+C。"
cd relay && ROKID_TOKEN="$ROKID_TOKEN" npm run dev
