#!/usr/bin/env bash
# ============================================================
# 把 MedAI 换成「永久地址」：Cloudflare 命名隧道
#
# 前置（只做一次）：
#   1. 客户端执行 cloudflared tunnel login（浏览器授权，生成 ~/.cloudflared/cert.pem）
#   2. 域名已托管到 Cloudflare（NS 生效）
#
# 用法：
#   bash deploy/setup-tunnel.sh medai.example.com
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
TUNNEL_NAME="medai"
APP_URL="http://127.0.0.1:8801"
CF_DIR="/root/.cloudflared"
CONFIG="/etc/cloudflared/config.yml"

if [[ -z "$DOMAIN" ]]; then
  echo "用法: bash deploy/setup-tunnel.sh <你的域名>"
  echo "例如: bash deploy/setup-tunnel.sh medai.chenyunxin.com"
  exit 1
fi

if [[ ! -f "$CF_DIR/cert.pem" ]]; then
  echo "✗ 还没登录 Cloudflare。请先执行："
  echo "    cloudflared tunnel login"
  echo "  按提示在浏览器里选择你的域名并授权，完成后重新运行本脚本。"
  exit 1
fi

echo "==> 1/5 检查/创建隧道 $TUNNEL_NAME"
if ! cloudflared tunnel list 2>/dev/null | grep -q " $TUNNEL_NAME "; then
  cloudflared tunnel create "$TUNNEL_NAME"
else
  echo "   隧道已存在，跳过创建"
fi

TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk -v n="$TUNNEL_NAME" '$2==n {print $1}' | head -1)
[[ -n "$TUNNEL_ID" ]] || { echo "✗ 取不到隧道 ID"; exit 1; }
echo "   tunnel id = $TUNNEL_ID"

echo "==> 2/5 绑定域名 $DOMAIN"
cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>&1 | tail -2 || true

echo "==> 3/5 写入配置 $CONFIG"
mkdir -p /etc/cloudflared
cat > "$CONFIG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CF_DIR/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: $APP_URL
  - service: http_status:404
EOF
echo "   ok"

echo "==> 4/5 切换 systemd 服务到命名隧道"
cat > /etc/systemd/system/cloudflared-medai.service <<UNIT
[Unit]
Description=Cloudflare Tunnel for MedAI (named)
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared --config $CONFIG tunnel run
Restart=always
RestartSec=5
StandardOutput=append:/var/log/cloudflared.log
StandardError=append:/var/log/cloudflared.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl restart cloudflared-medai
sleep 5

echo "==> 5/5 验证"
systemctl is-active cloudflared-medai
curl -fsS -m 30 "https://$DOMAIN/api/health" && echo
echo
echo "=============================================="
echo " 永久地址: https://$DOMAIN"
echo "=============================================="
