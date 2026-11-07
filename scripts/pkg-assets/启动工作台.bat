@echo off
title 教师班主任工作台 · 本地服务版
cd /d %~dp0

rem 优先用包内便携 Node，没有则用系统 Node
set "NODE_EXE=%~dp0node\node.exe"
if not exist "%NODE_EXE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo 未找到 Node.js：请把 Node.js 22 的 node.exe 放到 node 文件夹，或安装 https://nodejs.org
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

rem 数据统一放在包根的 data 目录
set "DATA_DIR=%~dp0data"

echo 正在启动教师班主任工作台（本地服务版）...
"%NODE_EXE%" app\server\server.js
echo.
echo 服务已退出（数据保存在 data 目录，不受影响）。
pause
