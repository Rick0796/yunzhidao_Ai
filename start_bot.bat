@echo off
cd /d d:\Ai获客

REM 先杀掉已有的 telegram_devbot 进程
taskkill /F /FI "WINDOWTITLE eq telegram_devbot*" >nul 2>&1
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq python.exe" /FO CSV 2^>nul ^| findstr /i "python"') do (
    wmic process where "ProcessId=%%~i" get CommandLine 2^>nul | findstr /i "telegram_devbot" >nul && taskkill /F /PID %%~i >nul 2>&1
)

echo Telegram 机器人启动中...
python -m backend.telegram_devbot
pause
