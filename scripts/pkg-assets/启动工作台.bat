@echo off
title 教师班主任工作台 · 本地服务版
cd /d "%~dp0"

rem 优先使用包内便携 Node，其次系统 Node
set "NODE_EXE=%~dp0node\node.exe"
if exist "%NODE_EXE%" goto have_node

where node >nul 2>nul
if errorlevel 1 goto no_node
set "NODE_EXE=node"
goto have_node

:no_node
echo 未找到 Node.js：请把 node.exe 放到本包的 node 文件夹，或安装 https://nodejs.org
pause
exit /b 1

:have_node
set "DATA_DIR=%~dp0data"
echo 正在启动教师班主任工作台（本地服务版）...
"%NODE_EXE%" app\server\server.js
echo.
echo 服务已退出（数据保存在 data 目录，不受影响）。
pause
