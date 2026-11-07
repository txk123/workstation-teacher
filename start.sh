#!/usr/bin/env bash
# 教师班主任工作台（本地服务版）· 一键启动
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装：https://nodejs.org"
  exit 1
fi
echo "正在启动教师班主任工作台..."
node server/server.js
