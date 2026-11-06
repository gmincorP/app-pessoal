@echo off
REM Reinicia SO o app pessoal (porta 5100) -- nao mexe no ERP (porta 5000)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5100 " ^| findstr /i "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
cd /d "%~dp0backend"
start "App Pessoal 5100" /min cmd /c "..\.venv\Scripts\python.exe app.py > ..\servidor.log 2>&1"
echo App pessoal reiniciado: http://localhost:5100
