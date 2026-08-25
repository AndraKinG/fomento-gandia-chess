@echo off
rem ---------------------------------------------------------------------------
rem  Actualiza los ELOs FIDE del club. Lo lanza el Programador de tareas de
rem  Windows, sin abrir ninguna ventana.
rem
rem  POR QUE UN .cmd Y NO LA TAREA LLAMANDO A NODE DIRECTAMENTE: el Programador
rem  no tiene ni el PATH ni el directorio de trabajo de tu sesion, asi que un
rem  "node scripts/..." a secas se ejecuta en C:\Windows\System32 y no encuentra
rem  ni el proyecto ni el .env.local. Aqui se entra primero en la carpeta.
rem
rem  DEJA UN REGISTRO en logs/elo-fide.log, y es lo unico que hace de mas: una
rem  tarea programada que falla en silencio no se distingue de una que no existe.
rem ---------------------------------------------------------------------------

cd /d "%~dp0.."
if not exist "logs" mkdir "logs"

echo. >> "logs\elo-fide.log"
echo ===== %DATE% %TIME% ===== >> "logs\elo-fide.log"

node --experimental-strip-types --import ./scripts/cargar-ts.mjs scripts/actualizar-elo-fide.mjs >> "logs\elo-fide.log" 2>&1

if errorlevel 1 (
  echo RESULTADO: fallo ^(codigo %errorlevel%^) >> "logs\elo-fide.log"
) else (
  echo RESULTADO: ok >> "logs\elo-fide.log"
)
