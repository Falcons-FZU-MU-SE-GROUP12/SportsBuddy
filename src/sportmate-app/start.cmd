@echo off
rem ===========================================================================
rem  SportsBuddy 前端 · 一键启动
rem  启动一个零依赖静态服务器，然后把三个交付物的地址打印出来。
rem ===========================================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [错误] 找不到 node 命令。
  echo   本项目需要 Node.js 18+ 才能启动本地静态服务器（浏览器不允许 file:// 加载 ES Module）。
  echo   安装地址： https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
echo   正在启动SportsBuddy 前端...
echo.
node tools\server.mjs %1
pause
