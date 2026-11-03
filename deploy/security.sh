#!/usr/bin/env bash
# ============================================================
# MedAI 服务器安全加固（Ubuntu 22.04，root 执行）
# 幂等：可重复执行
# ⚠️ 执行前确认已完成 SSH 密钥登录，否则会把自己锁在门外
# ============================================================
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "请用 root 执行"; exit 1; }

log() { echo -e "\n\033[1;32m==> $*\033[0m"; }

# ---------- 0. 前置检查：必须至少有一个密钥 ----------
log "0/6 检查 SSH 密钥"
if ! grep -qE '^(ssh-|ecdsa-)' /root/.ssh/authorized_keys 2>/dev/null; then
  echo "✗ /root/.ssh/authorized_keys 里没有公钥，终止（否则会锁死）"
  exit 1
fi
echo "   已配置 $(grep -cE '^(ssh-|ecdsa-)' /root/.ssh/authorized_keys) 个公钥"

# ---------- 1. 防火墙 ----------
log "1/6 配置防火墙（只放行 22/80/443）"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq ufw >/dev/null
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status numbered | head -8

# ---------- 2. SSH 加固 ----------
log "2/6 SSH 加固（禁密码登录、禁 root 密码登录）"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s)
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' /etc/ssh/sshd_config
grep -q '^ClientAliveInterval' /etc/ssh/sshd_config || echo 'ClientAliveInterval 300' >> /etc/ssh/sshd_config
sshd -t
systemctl restart ssh
echo "   sshd 已重启（当前连接不会断，新连接需用密钥）"

# ---------- 3. 自动安全更新 ----------
log "3/6 开启自动安全更新"
apt-get install -y -qq unattended-upgrades >/dev/null
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
echo "   已开启每日安全更新"

# ---------- 4. fail2ban ----------
log "4/6 安装 fail2ban（SSH 爆破防护）"
apt-get install -y -qq fail2ban >/dev/null
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 3
ignoreip = 127.0.0.1/8

[sshd]
enabled = true
port    = 22
logpath = %(sshd_log)s
backend = systemd
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd | head -6

# ---------- 5. MySQL 只监听本机 ----------
log "5/6 检查 MySQL 监听地址"
BIND=$(ss -lntp 2>/dev/null | awk '/mysqld/ {print $4}' | head -1)
echo "   mysqld 监听: ${BIND:-未检测到}"
if echo "$BIND" | grep -q '0.0.0.0\|\*:'; then
  echo "   ⚠️ MySQL 监听在公网，建议改 bind-address=127.0.0.1"
else
  echo "   ✓ 仅本机可连"
fi

# ---------- 6. 应用端口只监听本机 ----------
log "6/6 检查应用端口"
APP=$(ss -lntp 2>/dev/null | awk '/:8801/ {print $4}' | head -1)
echo "   medai: ${APP:-未监听}"
if echo "$APP" | grep -q '127.0.0.1'; then
  echo "   ✓ 8801 仅本机可见（由 Nginx / 隧道转发）"
else
  echo "   ⚠️ 8801 监听在公网，请确认 apps 已设置 HOST=127.0.0.1"
fi

echo
echo "=============================================="
echo " 加固完成"
echo "=============================================="
echo " 现在只能用 SSH 密钥登录：ssh -i <私钥> root@<IP>"
echo " 若密钥丢失：登录阿里云控制台 → 远程连接(VNC) → 重新配置"
echo " 查看封禁：fail2ban-client status sshd"
echo " 解封 IP ：fail2ban-client set sshd unbanip <IP>"
