#!/usr/bin/env bash
# ============================================================
# MedAI 数据备份（数据库 + 配置文件）
# 建议由 systemd timer 每日执行；也可手动跑
# ============================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DATE=$(date +%F)
STAMP=$(date +%F_%H%M%S)
DB_NAME="${DB_NAME:-medai}"
APP_DIR="${APP_DIR:-/opt/medai}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date '+%F %T')] 开始备份"

# ---------- 1. 数据库 ----------
DB_FILE="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"
if mysqldump --single-transaction --quick --routines --triggers "$DB_NAME" 2>/dev/null | gzip > "$DB_FILE"; then
  SIZE=$(du -h "$DB_FILE" | cut -f1)
  echo "  ✓ 数据库: $DB_FILE ($SIZE)"
else
  echo "  ✗ 数据库备份失败"
  rm -f "$DB_FILE"
  exit 1
fi

# ---------- 2. 配置文件（含 .env，权限 600） ----------
ENV_FILE="$BACKUP_DIR/env-${STAMP}.tar.gz"
if [[ -f "$APP_DIR/server/.env" ]]; then
  tar -czf "$ENV_FILE" -C "$APP_DIR/server" .env
  chmod 600 "$ENV_FILE"
  echo "  ✓ 配置: $ENV_FILE"
fi

# ---------- 3. 完整性校验 ----------
if gzip -t "$DB_FILE" 2>/dev/null; then
  echo "  ✓ 压缩包完整性校验通过"
else
  echo "  ✗ 备份文件损坏"
  exit 1
fi
echo "  表数量: $(zcat "$DB_FILE" | grep -c '^CREATE TABLE')"

# ---------- 4. 清理过期 ----------
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime +"$KEEP_DAYS" -print -delete | wc -l)
echo "  ✓ 清理过期备份 $DELETED 个（保留 $KEEP_DAYS 天）"

# ---------- 5. 汇总 ----------
TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
COUNT=$(find "$BACKUP_DIR" -name "*.gz" | wc -l)
echo "  当前备份: $COUNT 个文件，共 $TOTAL"
echo "[$(date '+%F %T')] 备份完成"
