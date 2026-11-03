@echo off
chcp 65001 >nul
title 智医质控 MedAI
cd /d "%~dp0"

echo ==========================================
echo   智医质控 MedAI · 启动中
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node 20 以上版本
  pause
  exit /b 1
)

if not exist "server\node_modules" (
  echo [1/3] 安装后端依赖...
  pushd server
  call npm install --no-audit --no-fund
  popd
)

if not exist "web\dist\index.html" (
  echo [2/3] 构建前端...
  pushd web
  if not exist "node_modules" call npm install --no-audit --no-fund
  set TEMP=%cd%\..\.tmp
  set TMP=%cd%\..\.tmp
  call npm run build:only
  popd
)

echo [3/3] 启动服务 http://127.0.0.1:8801
echo.
start "" http://127.0.0.1:8801
cd server
node src/index.js
pause
