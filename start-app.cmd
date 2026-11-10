@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 无法启动：没有找到 Node.js。
  echo.
  echo 请从 https://nodejs.org/ 下载并安装 LTS 版本，重新打开终端后再试。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo 无法启动：没有找到 npm。
  echo.
  echo 标准 Node.js 安装会同时安装 npm。请从 https://nodejs.org/ 重新安装 LTS 版本。
  pause
  exit /b 1
)

call npm start
if errorlevel 1 pause
