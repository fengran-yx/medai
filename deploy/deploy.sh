#!/usr/bin/env bash
# ============================================================
# 智医质控 MedAI · 云服务器一键部署脚本
# 适用：Ubuntu 22.04 / 24.04（Debian 系），root 执行
# 用法：把项目上传到 /opt/medai 后，执行 bash deploy/deploy.sh
# ============================================================
set -euo pipefail

# ---------- 按需修改 ----------
APP_DIR="/opt/medai"
DB_NAME="medai"
DB_USER="medai"
DB_PASS="${MEDAI_DB_PASS:-}"          # 不填会自动生成
JWT_SECRET="${MEDAI_JWT_SECRET:-}"    # 不填会自动生成
DEEPSEEK_KEY="${DEEPSEEK_API_KEY:-}"  # 可选
NODE_MAJOR=20
# ------------------------------

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }
die() { echo -e "\033[1;31m[错误] $*\033[0m" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "请用 root 执行：sudo bash deploy/deploy.sh"
[[ -f "$APP_DIR/server/package.json" ]] || die "未找到 $APP_DIR/server/package.json，请先把项目上传到 $APP_DIR"

# 自动生成密码
[[ -n "$DB_PASS" ]] || DB_PASS="$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-20)"
[[ -n "$JWT_SECRET" ]] || JWT_SECRET="$(openssl rand -hex 32)"
SERVER_IP="$(curl -s --max-time 5 ifconfig.me || echo '127.0.0.1')"

log "1/8 安装系统依赖（Node ${NODE_MAJOR} / MySQL / Nginx）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg openssl nginx >/dev/null

if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "   Node $(node -v) / npm $(npm -v)"

if ! command -v mysql >/dev/null; then
  apt-get install -y -qq mysql-server >/dev/null
fi
systemctl enable --now mysql >/dev/null 2>&1 || true
echo "   MySQL $(mysql --version | awk '{print $5}' | tr -d ,)"

log "2/8 创建数据库与专用账号"
mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "   库 ${DB_NAME} / 用户 ${DB_USER} 就绪"

log "3/8 写入生产环境配置"
cat > "$APP_DIR/server/.env" <<ENV
PORT=8801
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=12h
DEEPSEEK_API_KEY=${DEEPSEEK_KEY}
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
ENV
chmod 600 "$APP_DIR/server/.env"
echo "   .env 已生成（权限 600），数据库密码：${DB_PASS}"

log "4/8 安装依赖并初始化数据"
cd "$APP_DIR/server"
npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com 2>/dev/null || npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com
node scripts/init-db.js
node scripts/seed.js
node scripts/seed-kb.js
node scripts/eval-rag.js --ci || echo "   [警告] RAG 评测未达标，请检查知识库"

log "5/8 前端产物"
if [ -f "$APP_DIR/web/dist/index.html" ]; then
  echo "  已有构建产物，跳过构建（本机构建后随包上传，避免小内存服务器 OOM）"
else
  cd "$APP_DIR/web"
  npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com 2>/dev/null || npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
  TEMP=/tmp/medai-build TMP=/tmp/medai-build npm run build:only
  [[ -f "$APP_DIR/web/dist/index.html" ]] || die "前端构建产物缺失"
fi
echo "   dist 产物 $(du -sh "$APP_DIR/web/dist" | cut -f1)"

log "6/8 注册 systemd 服务"
cat > /etc/systemd/system/medai.service <<UNIT
[Unit]
Description=MedAI 智医质控服务
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}/server
EnvironmentFile=${APP_DIR}/server/.env
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/medai.log
StandardError=append:/var/log/medai.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable medai >/dev/null
systemctl restart medai
sleep 2
curl -fsS http://127.0.0.1:8801/api/health >/dev/null || die "服务启动失败，查看：journalctl -u medai -n 50"
echo "   服务已启动"

log "7/8 配置 Nginx 反向代理"
cat > /etc/nginx/sites-available/medai <<NGINX
server {
    listen 80;
    server_name _;

    client_max_body_size 10m;
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location / {
        proxy_pass http://127.0.0.1:8801;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/medai /etc/nginx/sites-enabled/medai
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo "   Nginx 已生效"

log "8/8 打开防火墙端口"
if command -v ufw >/dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

cat <<DONE

============================================================
  部署完成
============================================================
  访问地址   http://${SERVER_IP}
  健康检查   http://${SERVER_IP}/api/health
  服务日志   journalctl -u medai -f   （或 tail -f /var/log/medai.log）
  重启服务   systemctl restart medai
  演示账号   admin/admin123 · quality/qc123456 · doctor/doc123456

  重要：数据库密码与 JWT 密钥已写入 ${APP_DIR}/server/.env
        请自行保存：DB_PASS=${DB_PASS}
============================================================
DONE
