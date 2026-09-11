@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if "%~1"=="" (
  echo Uso: 01_Auditar_Fuentes.bat "C:\Ruta\Excel"
  exit /b 1
)
python "%SCRIPT_DIR%scripts\auditar_fuentes.py" --config "%SCRIPT_DIR%config\conexiones.example.json" --fuentes "%~1" --salida "%SCRIPT_DIR%diagnostico_controlops.json"
echo.
echo Diagnostico creado en: %SCRIPT_DIR%diagnostico_controlops.json
pause

