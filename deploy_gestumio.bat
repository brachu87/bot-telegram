@echo off
cd /d "%~dp0"
echo === Bot Telegram + Gestumio: subir cambios ===
git add -A
git commit -m "Integracion con Gestumio: /vincular + tools (gasto/cobro/cliente/consultas) via API /api/bot"
git push origin HEAD
echo.
echo === LISTO ===
echo Si el bot corre en Railway, redespliega solo con el push.
echo Si lo corres en tu PC, cerralo y volve a abrirlo (npm start) para tomar los cambios.
echo Acordate de configurar GESTUMIO_API_URL en el .env si tu Gestumio no esta en https://app.gestumio.com
pause
