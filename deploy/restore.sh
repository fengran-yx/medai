#!/usr/bin/env bash
# 从备份恢复数据库（谨慎操作，会覆盖现有数据）
# 用法：bash deploy/restore.sh /opt/backups/medai-2026-11-04_033000.sql.gz
set -euo pipefail

FILE="${1:-}"
DB_NAME="${DB_NAME:-medai}"

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "用法: bash deploy/restore.sh <备份文件.sql.gz>"
  echo "可用备份："
  ls -lh /opt/backups/*.sql.gz 2>/dev/null | tail -5 || echo "  （无）"
  exit 1
fi

echo "即将用 $FILE 覆盖数据库 $DB_NAME"
read -r -p "确认继续？输入 yes: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "已取消"; exit 1; }

echo "[1/3] 恢复前先给当前库做一份快照 ..."
mkdir -p /opt/backups
mysqldump --single-transaction --quick "$DB_NAME" | gzip > "/opt/backups/pre-restore-$(date +%F_%H%M%S).sql.gz"

echo "[2/3] 导入备份 ..."
gunzip -c "$FILE" | mysql "$DB_NAME"

echo "[3/3] 校验 ..."
mysql "$DB_NAME" -N -e "
  SELECT CONCAT('tables=', COUNT(*)) FROM information_schema.tables WHERE table_schema='$DB_NAME';
  SELECT CONCAT('records=', COUNT(*)) FROM medical_records;
  SELECT CONCAT('kb_docs=', COUNT(*)) FROM kb_documents;
"

systemctl restart medai || true
sleep 2
curl -fsS http://127.0.0.1:8801/api/health && echo
echo "恢复完成"
