@echo off
rem 教师班主任工作台（本地服务版）· 一键启动
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)
echo 正在启动教师班主任工作台...
node server\server.js
echo.
echo 服务已退出。
pause
