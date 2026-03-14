@echo off
cd /d %~dp0
if not exist runtime mkdir runtime
set PYTHON_EXE=D:\python\python3.11.5\python.exe
start "Telegram DevBot" /min cmd /c "\"%PYTHON_EXE%\" backend\telegram_devbot.py >> runtime\telegram_devbot.log 2>&1"
echo Telegram DevBot started in background.
echo Log file: runtime\telegram_devbot.log
