@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
echo ============================================
echo   马嘉棋2 - 清理被占用的端口
echo ============================================
echo.

rem ============ 1. 读取要清理的端口（必须输入）============
set "PORT="
if not "%~1"=="" set "PORT=%~1"
if "!PORT!"=="" set /p "PORT=请输入要清理的端口号（例如 3000）: "
if "!PORT!"=="" (
  echo [错误] 必须输入一个端口号才能清理。
  echo        用法一：直接运行本脚本，按提示输入端口
  echo        用法二：清理端口.bat 3000
  echo.
  pause
  exit /b 1
)
echo [信息] 准备清理端口 !PORT! ...
echo.

rem ============ 2. 查找占用该端口的监听进程并结束 ============
set "FOUND="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R ":!PORT! " ^| findstr "LISTENING"') do (
  set "FOUND=%%p"
  echo [信息] 端口 !PORT! 被进程 PID %%p 占用，正在结束...
  taskkill /F /PID %%p >nul 2>nul
  if errorlevel 1 (
    echo [警告] 结束进程 %%p 失败（可能需要在管理员身份下运行）。
  ) else (
    echo [完成] 已结束进程 %%p。
  )
)

if not defined FOUND (
  echo [信息] 没有发现占用端口 !PORT! 的监听进程，无需清理。
)

echo.
echo 全部完成。
pause
exit /b 0
