#!/usr/bin/env bash
# 上线自检：对已部署的 MedAI 跑一遍核心链路
# 用法：bash deploy/verify.sh https://your-domain.com
set -uo pipefail

BASE="${1:-http://127.0.0.1:8801}"
PASS=0
FAIL=0

ok()   { echo -e "  \033[32m✓\033[0m $1"; PASS=$((PASS+1)); }
bad()  { echo -e "  \033[31m✗\033[0m $1"; FAIL=$((FAIL+1)); }

echo "自检目标：$BASE"
echo

# 1. 健康检查
HEALTH=$(curl -fsS --max-time 10 "$BASE/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  AI=$(echo "$HEALTH" | grep -o '"ai":"[^"]*"' | cut -d'"' -f4)
  ok "健康检查通过（AI 引擎：$AI）"
else
  bad "健康检查失败"
fi

# 2. 首页可访问
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/")
[ "$CODE" = "200" ] && ok "前端首页 200" || bad "前端首页返回 $CODE"

# 3. 登录
TOKEN=$(curl -fsS --max-time 10 -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"quality","password":"qc123456"}' 2>/dev/null \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && ok "登录成功（token ${#TOKEN} 位）" || bad "登录失败"

if [ -z "$TOKEN" ]; then
  echo
  echo "登录失败，后续检查跳过。"
  exit 1
fi

AUTH="Authorization: Bearer $TOKEN"

# 4. 看板
curl -fsS --max-time 10 "$BASE/api/dashboard/overview" -H "$AUTH" >/dev/null 2>&1 \
  && ok "看板接口正常" || bad "看板接口失败"

# 5. 病历列表
REC=$(curl -fsS --max-time 10 "$BASE/api/records?page=1&size=1" -H "$AUTH" 2>/dev/null)
echo "$REC" | grep -q '"code":0' && ok "病历列表正常" || bad "病历列表失败"

# 6. 知识库
KB=$(curl -fsS --max-time 10 "$BASE/api/kb/stats" -H "$AUTH" 2>/dev/null)
DOCS=$(echo "$KB" | sed -n 's/.*"documents":\([0-9]*\).*/\1/p')
[ "${DOCS:-0}" -gt 0 ] && ok "知识库已就绪（$DOCS 篇文档）" || bad "知识库为空"

# 7. RAG 问答
ASK=$(curl -fsS --max-time 60 -X POST "$BASE/api/kb/ask" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"question":"现病史应该怎么写才规范？","topK":3}' 2>/dev/null)
echo "$ASK" | grep -q '"sources"' && ok "RAG 问答可用" || bad "RAG 问答失败"

# 8. Agent
AG=$(curl -fsS --max-time 120 -X POST "$BASE/api/agent/run" -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"goal":"统计最近 7 天的质控情况，列出高频问题"}' 2>/dev/null)
echo "$AG" | grep -q '"steps"' && ok "Agent 可用" || bad "Agent 失败"

echo
echo "结果：通过 $PASS 项，失败 $FAIL 项"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
