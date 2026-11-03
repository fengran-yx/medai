@echo off
chcp 65001 >nul
title 开放 MedAI 的 8801 端口

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo 需要管理员权限，正在请求提权...
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)

echo ==========================================
echo   为局域网开放 8801 端口（入站 TCP）
echo ==========================================
echo.

netsh advfirewall firewall delete rule name="MedAI-8801" >nul 2>&1
netsh advfirewall firewall add rule name="MedAI-8801" dir=in action=allow protocol=TCP localport=8801

echo.
echo 本机局域网地址：
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo    http://%%b:8801
)
echo.
echo 其他电脑用上面的地址访问即可（需在同一 WiFi / 局域网）。
pause
