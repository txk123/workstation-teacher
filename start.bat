@echo off
title 教师班主任工作台（本地服务版）
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

set "DATA_DIR=%~dp0data"
echo 正在启动教师班主任工作台（本地服务版）...
node server\server.js
echo.
echo 服务已退出（数据保存在 data 目录，不受影响）。
pause
exit /b 0

:no_node
echo 未检测到 Node.js，请先安装：https://nodejs.org
pause
exit /b 1
