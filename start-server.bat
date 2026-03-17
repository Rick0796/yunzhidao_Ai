@echo off
chcp 65001 >nul
title 云智道AI工作台 - 统一后端服务
echo 正在启动统一后端服务（FastAPI，端口 8787）...
echo 关闭此窗口将停止服务。
echo.

:loop
python -m backend.main
echo.
echo 服务意外停止，3 秒后自动重启...
timeout /t 3 /nobreak >nul
goto loop
