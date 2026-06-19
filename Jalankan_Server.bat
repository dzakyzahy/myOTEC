@echo off
cd /d "%~dp0"
echo myOTEC — server lokal http://127.0.0.1:8765/
echo Tutup jendela ini untuk menghentikan server.
python -m http.server 8765
