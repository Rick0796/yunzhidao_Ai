@echo off
chcp 65001 >nul
echo ========================================
echo 启动后端服务
echo ========================================
echo.

cd /d "%~dp0"

echo 检查配置文件...
if not exist "backend\config.local.json" (
    if not exist "server\config.local.json" (
        echo [错误] 未找到配置文件
        echo 请创建 backend\config.local.json 或 server\config.local.json
        pause
        exit /b 1
    )
)

echo 启动后端服务...
python backend\main.py

pause
