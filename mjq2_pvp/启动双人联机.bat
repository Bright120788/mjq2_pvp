@echo off
chcp 936 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo   马嘉棋2 - 启动双人联机 服务器
echo ============================================
echo.

rem ============ 0. 端口设置（默认 3000，可自定义）============
set "PORT=3000"
if not "%~1"=="" (
  set "PORT=%~1"
) else (
  set /p "PORT=请输入端口号（直接回车用默认 3000）: "
  if "!PORT!"=="" set "PORT=3000"
)
echo [信息] 本次使用端口：!PORT!
echo.

rem ============ 1. 检测 / 自动安装 Node.js ============
where node >nul 2>nul
if errorlevel 1 goto noNode
echo [信息] 已检测到 Node.js 版本：
node -v
goto afterNode

:noNode
echo [信息] 未检测到 Node.js，尝试自动安装（winget）...
where winget >nul 2>nul
if errorlevel 1 goto installNodeFail
winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
where node >nul 2>nul
if not errorlevel 1 goto nodeOk
:installNodeFail
echo [错误] Node.js 自动安装失败。请手动前往 https://nodejs.org/ 安装后重试。
echo        请选择 LTS 版本，并勾选「添加到 PATH」。
pause
exit /b 1
:nodeOk
echo [信息] Node.js 自动安装成功。

:afterNode
rem ============ 2. 安装依赖 ============
echo.
echo [信息] 检查并安装依赖（ws 等）...
cd /d "%~dp0"
if exist "%~dp0node_modules" goto depsOk
echo [信息] 未检测到 node_modules，执行 npm install ...
call npm install
if errorlevel 1 (
  echo [错误] 依赖安装失败，请检查网络后重试。
  pause
  exit /b 1
)
echo [信息] 依赖安装完成。
goto afterDeps
:depsOk
echo [信息] 依赖已存在，跳过安装（如需重装，删除 node_modules 后重跑本脚本）。
:afterDeps

rem ============ 3. 启动服务器 ============
echo.
echo [信息] 正在启动服务器（局域网联机端口 !PORT!）...
echo        启动后会自动打开主页，也可以手动访问：
echo          主页(推荐入口)  http://localhost:!PORT!/
echo          项目说明文档    http://localhost:!PORT!/doc
echo          卡组编辑器      http://localhost:!PORT!/deck
echo        房间号随便取（字母/数字/_/-），两人用同一个号就是同一局
echo          房主 / 蓝方都用 http://localhost:!PORT!/play/1
echo          局域网另一台    http://^<房主局域网IP^>:!PORT!/play/1
echo        第 3 人及以后自动进入观战（可看双方手牌与完整战报）
echo        按 Ctrl+C 可停止服务
echo.
call node server.js !PORT!
pause
exit /b 0
